<template>
  <view class="page has-bottom-bar">
    <view v-if="!doc && loading" class="empty">
      <view class="muted">正在加载…</view>
    </view>

    <view v-else-if="!doc" class="empty">
      <view class="empty__icon">🔍</view>
      <view class="empty__text">单据不存在或已被删除</view>
    </view>

    <block v-else>
      <!-- 单据头 -->
      <view class="card head">
        <view class="head__top">
          <text class="head__no">{{ doc.docNo || '待生成单号' }}</text>
          <text :class="['tag', 'tag--' + statusOf(doc.status).key]">
            {{ statusOf(doc.status).text }}
          </text>
        </view>
        <view class="head__type">
          <text>{{ doc.docTypeName || '—' }}</text>
          <text class="head__copy" @click="copyNo">复制单号</text>
        </view>
        <view class="head__amount num">¥{{ fmtMoney(doc.totalAmount) }}</view>
        <view class="muted head__cn">{{ toChineseAmount(doc.totalAmount) }}</view>
      </view>

      <!-- 基本信息 -->
      <view class="card">
        <view class="section-title">基本信息</view>
        <view class="info">
          <view class="info__item"><text class="muted">日期</text><text>{{ doc.bizDate || '—' }}</text></view>
          <view class="info__item"><text class="muted">仓库</text><text>{{ doc.warehouseName || '—' }}</text></view>
          <view class="info__item"><text class="muted">往来单位</text><text>{{ doc.partnerName || '—' }}</text></view>
          <view class="info__item"><text class="muted">联系电话</text><text>{{ doc.contactPhone || '—' }}</text></view>
          <view class="info__item info__item--full">
            <text class="muted">收货地址</text><text class="info__wrap">{{ doc.contactAddress || '—' }}</text>
          </view>
          <view class="info__item"><text class="muted">部门</text><text>{{ doc.department || '—' }}</text></view>
          <view class="info__item"><text class="muted">经办人</text><text>{{ doc.handler || '—' }}</text></view>
          <view class="info__item"><text class="muted">制单人</text><text>{{ doc.creatorName || '—' }}</text></view>
          <view class="info__item"><text class="muted">修改人</text><text>{{ doc.modifierName || '—' }}</text></view>
          <view class="info__item info__item--full">
            <text class="muted">摘要</text><text class="info__wrap">{{ doc.summary || '—' }}</text>
          </view>
          <view class="info__item info__item--full">
            <text class="muted">备注</text><text class="info__wrap">{{ doc.remark || '—' }}</text>
          </view>
        </view>
      </view>

      <!-- 单据明细 -->
      <view class="card">
        <view class="section-title">
          单据明细
          <text class="muted section-count">{{ lines.length }} 项</text>
        </view>

        <view v-if="!lines.length" class="muted empty-lines">没有明细</view>

        <view v-for="(line, index) in lines" :key="line.id || index" class="line">
          <view class="line__top">
            <text class="line__no">{{ index + 1 }}</text>
            <text class="line__name">{{ line.itemName || '—' }}</text>
          </view>
          <view v-if="line.itemSpec || line.itemColor" class="line__spec">
            {{ [line.itemSpec, line.itemColor].filter(Boolean).join(' / ') }}
          </view>
          <view class="line__bottom">
            <text class="muted line__qty">
              {{ fmtQty(line.qty) }} {{ line.unitName || '' }} × {{ fmtMoney(line.price) }}
            </text>
            <text class="line__amount num">¥{{ fmtMoney(line.amount ?? amountOf(line.qty || 0, line.price || 0)) }}</text>
          </view>
          <view v-if="line.remark" class="muted line__remark">备注：{{ line.remark }}</view>
        </view>

        <!-- 合计 -->
        <view class="sum">
          <view class="sum__row">
            <text class="muted">合计数量</text>
            <text class="num">{{ fmtQty(doc.totalQty) }}</text>
          </view>
          <view class="sum__row">
            <text class="muted">合计金额</text>
            <text class="num sum__amount">¥{{ fmtMoney(doc.totalAmount) }}</text>
          </view>
          <view class="sum__row">
            <text class="muted">已收金额</text>
            <text class="num">¥{{ fmtMoney(doc.paidAmount) }}</text>
          </view>
          <view class="sum__row">
            <text class="muted">欠款</text>
            <text class="num sum__debt">¥{{ fmtMoney(unpaid) }}</text>
          </view>
          <view class="sum__cn muted">大写：{{ toChineseAmount(doc.totalAmount) }}</view>
        </view>
      </view>

      <!-- 流转信息 -->
      <view class="card">
        <view class="section-title">流转信息</view>
        <view class="info">
          <view class="info__item"><text class="muted">打印次数</text><text>{{ doc.printCount ?? 0 }} 次</text></view>
          <view class="info__item"><text class="muted">保存时间</text><text>{{ doc.updatedAt || doc.createdAt || '—' }}</text></view>
          <view class="info__item info__item--full">
            <text class="muted">审核时间</text><text>{{ doc.auditedAt || '—' }}</text>
          </view>
        </view>
      </view>
    </block>

    <!-- 底部操作 -->
    <view v-if="doc" class="bottom-bar">
      <view class="btn bottom-bar__btn" @click="openActions">操 作</view>
      <view v-if="canEdit" class="btn bottom-bar__btn" @click="editDoc">编 辑</view>
      <view class="btn btn--primary bottom-bar__btn" @click="goPrint">打 印</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { ensureLogin } from '../../api/client';
import { docApi, type DocHead, type DocLine } from '../../api/doc';
import { amountOf, fmtMoney, fmtQty, statusOf, toChineseAmount } from '../../utils/format';

const doc = ref<DocHead | null>(null);
const loading = ref(false);
let docId = 0;

const lines = computed<DocLine[]>(() => doc.value?.lines || []);
const unpaid = computed(() => Number(doc.value?.totalAmount || 0) - Number(doc.value?.paidAmount || 0));
const canEdit = computed(() => {
  const s = Number(doc.value?.status ?? 0);
  return s === 0 || s === 1;
});

const ops = computed<{ key: string; label: string }[]>(() => {
  const d = doc.value;
  if (!d) return [];
  const s = Number(d.status ?? 0);
  const out: { key: string; label: string }[] = [];
  if (s === 0 || s === 1) out.push({ key: 'audit', label: s === 1 ? '反审核' : '审核' });
  if (s === 1 && Number(d.needPost) === 1) out.push({ key: 'post', label: '过账' });
  if (s !== 2 && s !== 9) out.push({ key: 'void', label: '作废' });
  if (s !== 2) out.push({ key: 'remove', label: '删除' });
  return out;
});

async function fetchDetail() {
  if (!docId) {
    doc.value = null;
    return;
  }
  loading.value = true;
  try {
    doc.value = await docApi.detail(docId);
  } catch (e) {
    doc.value = null;
    uni.showModal({
      title: '读取失败',
      content: (e as Error).message || '请稍后重试',
      showCancel: false,
    });
  } finally {
    loading.value = false;
  }
}

function confirmBox(content: string, title = '请确认'): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
}

function toast(title: string) {
  uni.showToast({ title, icon: 'none', duration: 2000 });
}

function copyNo() {
  const no = doc.value?.docNo;
  if (!no) return;
  uni.setClipboardData({
    data: no,
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  });
}

function editDoc() {
  if (!doc.value?.id) return;
  uni.navigateTo({ url: `/pages/doc/edit?id=${doc.value.id}` });
}

function goPrint() {
  if (!doc.value?.id) return;
  uni.navigateTo({ url: `/pages/doc/print?id=${doc.value.id}` });
}

function openActions() {
  const list = ops.value;
  if (!list.length) return;
  uni.showActionSheet({
    itemList: list.map((o) => o.label),
    success: (res) => {
      const target = list[res.tapIndex];
      if (target) void runOp(target.key);
    },
  });
}

async function runOp(key: string) {
  const d = doc.value;
  if (!d?.id) return;

  if (key === 'audit') {
    const revert = Number(d.status) === 1;
    const ok = await confirmBox(revert ? '确定要把这张单据反审核回草稿吗？' : '确定审核通过这张单据吗？');
    if (!ok) return;
    uni.showLoading({ title: '处理中…', mask: true });
    try {
      await docApi.audit(d.id);
      uni.hideLoading();
      toast(revert ? '已反审核' : '审核通过');
      await fetchDetail();
    } catch (e) {
      uni.hideLoading();
      toast((e as Error).message || '操作失败');
    }
    return;
  }

  if (key === 'post') {
    const ok = await confirmBox('过账会写入库存流水，且不可再修改明细，确定继续吗？');
    if (!ok) return;
    uni.showLoading({ title: '过账中…', mask: true });
    try {
      await docApi.post(d.id);
      uni.hideLoading();
      toast('过账成功');
      await fetchDetail();
    } catch (e) {
      uni.hideLoading();
      toast((e as Error).message || '过账失败');
    }
    return;
  }

  if (key === 'void') {
    const ok = await confirmBox('作废后单据不可再使用，确定作废？');
    if (!ok) return;
    try {
      await docApi.void(d.id);
      toast('已作废');
      await fetchDetail();
    } catch (e) {
      toast((e as Error).message || '作废失败');
    }
    return;
  }

  if (key === 'remove') {
    const ok = await confirmBox('删除后不可恢复，确定删除这张单据？');
    if (!ok) return;
    try {
      await docApi.remove(d.id);
      uni.showToast({ title: '已删除', icon: 'none' });
      setTimeout(() => uni.navigateBack(), 600);
    } catch (e) {
      toast((e as Error).message || '删除失败');
    }
  }
}

onLoad((query) => {
  if (!ensureLogin()) return;
  docId = Number((query as Record<string, string> | undefined)?.id || 0);
  void fetchDetail();
});

onShow(() => {
  // 从编辑页返回时刷新，保证看到最新内容
  if (docId && doc.value) void fetchDetail();
});
</script>

<style scoped>
.empty {
  padding: 120rpx 40rpx;
  text-align: center;
}

.empty__icon {
  font-size: 72rpx;
  color: #d0d7de;
}

.empty__text {
  margin: 16rpx 0 8rpx;
  font-size: 28rpx;
  color: #6b7280;
}

.head__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head__no {
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
}

.head__type {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #4b5563;
}

.head__copy {
  font-size: 24rpx;
  color: #1677ff;
  padding: 4rpx 10rpx;
}

.head__amount {
  margin-top: 18rpx;
  font-size: 48rpx;
  font-weight: 700;
  color: #d4380d;
}

.head__cn {
  margin-top: 6rpx;
  font-size: 22rpx;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2328;
  padding-bottom: 14rpx;
  margin-bottom: 6rpx;
  border-bottom: 1rpx solid #f0f2f5;
}

.section-count {
  font-size: 22rpx;
  font-weight: 400;
}

.info {
  display: flex;
  flex-wrap: wrap;
}

.info__item {
  display: flex;
  flex-direction: column;
  width: 50%;
  padding: 14rpx 0 0;
  font-size: 26rpx;
}

.info__item--full {
  width: 100%;
}

.info__item .muted {
  font-size: 22rpx;
  margin-bottom: 6rpx;
}

.info__wrap {
  word-break: break-all;
}

.empty-lines {
  padding: 30rpx 0;
  font-size: 24rpx;
  text-align: center;
}

.line {
  padding: 18rpx 0;
  border-bottom: 1rpx dashed #f0f2f5;
}

.line__top {
  display: flex;
  align-items: center;
}

.line__no {
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  margin-right: 12rpx;
  font-size: 22rpx;
  color: #6b7280;
  text-align: center;
  background-color: #f4f5f7;
  border-radius: 8rpx;
}

.line__name {
  flex: 1;
  font-size: 28rpx;
  color: #1f2328;
  word-break: break-all;
}

.line__spec {
  margin: 8rpx 0 0 52rpx;
  font-size: 24rpx;
  color: #8b949e;
}

.line__bottom {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 8rpx 0 0 52rpx;
}

.line__qty {
  font-size: 24rpx;
}

.line__amount {
  font-size: 26rpx;
  font-weight: 600;
  color: #1f2328;
}

.line__remark {
  margin: 6rpx 0 0 52rpx;
  font-size: 22rpx;
}

.sum {
  margin-top: 18rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid #f0f2f5;
}

.sum__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 26rpx;
}

.sum__amount {
  font-size: 32rpx;
  font-weight: 700;
  color: #d4380d;
}

.sum__debt {
  color: #cf1322;
}

.sum__cn {
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.6;
}

.bottom-bar__btn {
  flex: 1;
  /* margin: 0; */
}
</style>
