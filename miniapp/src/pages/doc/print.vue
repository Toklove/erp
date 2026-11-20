<template>
  <view class="print-page">
    <view v-if="loading" class="print-state">
      <view class="print-state__text">正在生成单据图片…</view>
    </view>

    <view v-else-if="error" class="print-state">
      <view class="print-state__text">{{ error }}</view>
      <button class="btn btn--primary print-state__btn" @click="prepare">重试</button>
    </view>

    <block v-else>
      <!-- 这张图就是最终打印的样子：和 Web 端打印页同一份版式（225mm 宽） -->
      <image class="print-image" :src="imagePath" mode="widthFix" @click="zoomImage" />
      <view class="print-tip">
        <text class="print-tip__text">
          与电脑端打印页同一版式，已按屏幕宽度等比缩小显示；点图片可放大查看。
        </text>
      </view>
    </block>

    <view v-if="!loading" class="bottom-bar">
      <button class="btn bottom-bar__btn" open-type="share">分享单据</button>
      <button class="btn btn--primary bottom-bar__btn" :disabled="!imagePath || busy" @click="saveImage">
        {{ busy ? '处理中…' : '保存图片（打印）' }}
      </button>
    </view>

    <!-- 离屏画布：只用来把单据画成图片，用户看不到 -->
    <!-- 小程序端用新版 2D 画布（真机可靠），H5 仍用旧版 canvas-id 接口 -->
    <!-- #ifdef MP-WEIXIN -->
    <canvas type="2d" id="print-canvas" class="print-canvas" :style="canvasStyle" />
    <!-- #endif -->
    <!-- #ifndef MP-WEIXIN -->
    <canvas canvas-id="print-canvas" id="print-canvas" class="print-canvas" :style="canvasStyle" />
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { ensureLogin } from '../../api/client';
import { docApi, type DocHead } from '../../api/doc';
import { SHEET_WIDTH_PX, renderDocImage } from '../../utils/print-image';

/**
 * 画布尺寸：宽度按纸张 1.5 倍（约 135dpi）准备，高度取小程序 canvas 的安全上限。
 * 明细特别多时会自动按画布高度降倍率，保证整张单据完整出图。
 */
const CANVAS_W = Math.round(SHEET_WIDTH_PX * 1.5);
const CANVAS_H = 1365;
const canvasStyle = `width:${CANVAS_W}px;height:${CANVAS_H}px;`;

const doc = ref<DocHead | null>(null);
const imagePath = ref('');
const loading = ref(true);
const error = ref('');
const busy = ref(false);
let docId = 0;

/** 取详情 → 画图 → 拿到临时文件路径 */
async function prepare() {
  if (!docId) {
    loading.value = false;
    error.value = '单据不存在';
    return;
  }
  loading.value = true;
  error.value = '';
  imagePath.value = '';
  try {
    if (!doc.value) doc.value = await docApi.detail(docId);
    // 等 canvas 渲染出来再取上下文
    await nextTick();
    const res = await renderDocImage('print-canvas', doc.value, CANVAS_W, CANVAS_H);
    imagePath.value = res.path;
  } catch (e) {
    error.value = (e as Error).message || '生成单据图片失败';
  } finally {
    loading.value = false;
  }
}

function zoomImage() {
  if (!imagePath.value) return;
  uni.previewImage({ urls: [imagePath.value], current: imagePath.value });
}

/** 「打印」= 记录打印次数 + 把这张图存下来（相册里的图就是打印用图） */
async function saveImage() {
  if (!imagePath.value || busy.value) return;
  busy.value = true;
  try {
    // 与 Web 端一致：点打印就累计一次打印次数，失败不打断保存
    docApi.printed(docId).catch(() => undefined);

    const name = `${doc.value?.docTypeName || '单据'}-${doc.value?.docNo || ''}.png`;

    // #ifdef H5
    const docEl = (globalThis as any).document;
    if (docEl) {
      const a = docEl.createElement('a');
      a.href = imagePath.value;
      a.download = name;
      docEl.body.appendChild(a);
      a.click();
      docEl.body.removeChild(a);
    }
    uni.showToast({ title: '已下载图片', icon: 'none' });
    // #endif

    // #ifndef H5
    await new Promise<void>((resolve, reject) => {
      uni.saveImageToPhotosAlbum({
        filePath: imagePath.value,
        success: () => resolve(),
        fail: (err: any) => reject(new Error(err?.errMsg || '保存到相册失败')),
      });
    });
    uni.showToast({ title: '已保存到相册，可直接打印', icon: 'none' });
    // #endif
  } catch (e) {
    uni.showModal({
      title: '保存失败',
      content: `${(e as Error).message || '请稍后重试'}\n如提示权限问题，请在系统设置里允许保存到相册。`,
      showCancel: false,
    });
  } finally {
    busy.value = false;
  }
}

onShareAppMessage(() => ({
  title: `${doc.value?.docTypeName || '单据'} ${doc.value?.docNo || ''}`.trim(),
  path: `/pages/doc/view?id=${docId}`,
}));

onLoad((query) => {
  if (!ensureLogin()) return;
  docId = Number((query as Record<string, string> | undefined)?.id || 0);
  void prepare();
});
</script>

<style scoped>
.print-page {
  min-height: 100vh;
  padding: 16rpx 0 190rpx;
  background-color: #f0f2f5;
  box-sizing: border-box;
}

.print-state {
  padding: 200rpx 48rpx;
  text-align: center;
}

.print-state__text {
  font-size: 26rpx;
  line-height: 1.6;
  color: #6b7280;
}

.print-state__btn {
  margin-top: 36rpx;
}

/* 图片本身就是一整张纸，宽度铺满、高度按比例自适应 */
.print-image {
  display: block;
  width: 100%;
  background-color: #ffffff;
  box-shadow: 0 4rpx 18rpx rgba(15, 23, 42, 0.12);
}

.print-tip {
  padding: 18rpx 32rpx 0;
}

.print-tip__text {
  font-size: 22rpx;
  line-height: 1.6;
  color: #8b949e;
}

/* 离屏画布：移到屏幕外，既不占位置也不会闪。
   用 top 方向移出（比 left:-9999px + z-index:-1 更稳，微信真机照样绘制）。 */
.print-canvas {
  position: fixed;
  top: -10000px;
  left: 0;
}

.bottom-bar__btn {
  flex: 1;
}
</style>