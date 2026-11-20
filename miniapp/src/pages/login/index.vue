<template>
  <view class="page login">
    <view class="login__brand">
      <view class="login__logo">单</view>
      <view class="login__title">业务单据</view>
      <view class="login__sub">仓库 ERP · 微信小程序端</view>
    </view>

    <!-- 微信一键登录：只有小程序里有意义，H5 构建时整块被去掉 -->
    <!-- #ifdef MP-WEIXIN -->
    <view class="card login__wx">
      <view class="login__wx-head">
        <text class="login__wx-title">微信一键登录</text>
        <text v-if="cloudMode" class="login__wx-tag">云托管</text>
      </view>
      <view class="muted login__wx-hint">
        {{ cloudMode ? '已接入微信云托管，微信身份由平台自动透传。' : '首次使用需要先在网页端「绑定微信」。' }}
      </view>

      <button class="btn login__wx-btn" :loading="wxLoading" @click="onWxLogin">
        微信一键登录
      </button>

      <view v-if="bindMode" class="login__bind">
        <view class="label login__gap">绑定码</view>
        <input
          v-model="bindCode"
          class="login__input login__code"
          placeholder="6 位绑定码"
          :maxlength="6"
          confirm-type="done"
          @confirm="onWxBind"
        />
        <view class="muted login__hint">
          绑定码在电脑端网页右上角「绑定微信」里生成，10 分钟内有效、只能用一次。
        </view>
        <view class="btn btn--primary login__submit" @click="onWxBind">绑定并登录</view>
      </view>

      <view v-if="wxConfigured === false" class="muted login__hint login__wx-warn">
        服务端未配置 WX_APPID / WX_SECRET：云托管内网调用仍可一键登录，直连方式暂不可用。
      </view>
    </view>

    <view class="login__divider">
      <text>或使用账号密码登录</text>
    </view>
    <!-- #endif -->

    <view class="card login__form">
      <view class="label">用户名</view>
      <input
        v-model="username"
        class="login__input"
        placeholder="请输入用户名"
        :maxlength="32"
        confirm-type="next"
      />

      <view class="label login__gap">密码</view>
      <input
        v-model="password"
        class="login__input"
        password
        placeholder="请输入密码"
        :maxlength="32"
        confirm-type="done"
        @confirm="submit"
      />

      <!-- 云托管模式下不需要手填服务器地址 -->
      <block v-if="!cloudMode">
        <view class="label login__gap">服务器地址</view>
        <input
          v-model="baseUrl"
          class="login__input"
          :placeholder="basePlaceholder"
          :maxlength="120"
          confirm-type="done"
          @confirm="submit"
        />
        <view class="muted login__hint">
          {{ baseHint }}
        </view>
      </block>

      <view
        class="btn btn--primary login__submit"
        :class="{ 'btn--disabled': submitting }"
        @click="submit"
      >
        {{ submitting ? '登录中…' : '登 录' }}
      </view>
    </view>

    <view class="login__foot muted">与 Web 端共用同一套账号和数据</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { login, wxBind, wxLogin, type LoginResp } from '../../api/auth';
import {
  getBaseUrl,
  getToken,
  isCloudMode,
  setBaseUrl,
  setToken,
  setUser,
} from '../../api/client';

const username = ref('');
const password = ref('');
const baseUrl = ref(getBaseUrl());
const submitting = ref(false);

/** 微信登录相关 */
const cloudMode = ref(isCloudMode());
const wxLoading = ref(false);
const bindMode = ref(false);
const bindCode = ref('');
const wxConfigured = ref<boolean | null>(null);

/** 小程序端必须填完整域名；H5 与 Web 部署在同域名时可留空（走同源 /api） */
let basePlaceholder = '如 https://erp.example.com';
let baseHint =
  '小程序必须连完整地址；正式环境请填写已在小程序后台配置的 https 域名，开发时可保留默认（需在微信开发者工具勾选「不校验合法域名」）。';
// #ifdef H5
basePlaceholder = '留空 = 与当前页面同源';
baseHint = '留空时请求走同源 /api（开发由 vite 代理转发，部署由 nginx 反向代理），一般无需填写。';
// #endif

onLoad(() => {
  // 已登录直接进列表页
  if (getToken()) {
    uni.reLaunch({ url: '/pages/doc/list' });
  }
});

function enter(res: LoginResp) {
  setToken(res.token);
  setUser(res.user);
  uni.showToast({ title: '登录成功', icon: 'success' });
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/doc/list' });
  }, 300);
}

/** wx.login 拿一次性 code：云托管模式下后端用不到，直连时才需要 */
function getWxCode(): Promise<string | undefined> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.login({
      provider: 'weixin',
      success: (res) => resolve(res.code || undefined),
      fail: () => resolve(undefined),
    });
    // #endif
    // #ifndef MP-WEIXIN
    resolve(undefined);
    // #endif
  });
}

async function onWxLogin() {
  if (wxLoading.value) return;
  wxLoading.value = true;
  bindMode.value = false;
  try {
    setBaseUrl(baseUrl.value);
    const code = cloudMode.value ? undefined : await getWxCode();
    if (!cloudMode.value && !code) {
      throw new Error('未能获取微信登录凭证，请重试');
    }
    const res = await wxLogin(code);
    if (res.bound) {
      enter(res);
      return;
    }
    // 未绑定：引导输入后台生成的绑定码
    wxConfigured.value = res.wxConfigured;
    bindMode.value = true;
    uni.showToast({ title: '该微信还未绑定账号', icon: 'none' });
  } catch (e) {
    uni.showModal({
      title: '微信登录失败',
      content: (e as Error).message || '请稍后重试',
      showCancel: false,
    });
  } finally {
    wxLoading.value = false;
  }
}

async function onWxBind() {
  const code = bindCode.value.trim().toUpperCase();
  if (code.length !== 6) {
    uni.showToast({ title: '请输入 6 位绑定码', icon: 'none' });
    return;
  }
  if (wxLoading.value) return;
  wxLoading.value = true;
  try {
    const wxCode = cloudMode.value ? undefined : await getWxCode();
    if (!cloudMode.value && !wxCode) {
      throw new Error('未能获取微信登录凭证，请重试');
    }
    enter(await wxBind(code, wxCode));
  } catch (e) {
    uni.showModal({
      title: '绑定失败',
      content: (e as Error).message || '请检查绑定码是否有效',
      showCancel: false,
    });
  } finally {
    wxLoading.value = false;
  }
}

async function submit() {
  if (submitting.value) return;

  const name = username.value.trim();
  if (!name) {
    uni.showToast({ title: '请输入用户名', icon: 'none' });
    return;
  }
  if (!password.value) {
    uni.showToast({ title: '请输入密码', icon: 'none' });
    return;
  }

  // 先存服务器地址，失败时也保留，方便改了再试
  setBaseUrl(baseUrl.value);

  submitting.value = true;
  try {
    enter(await login(name, password.value));
  } catch (e) {
    uni.showModal({
      title: '登录失败',
      content: (e as Error).message || '请检查用户名、密码和服务器地址',
      showCancel: false,
    });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.login {
  padding-top: 60rpx;
}

.login__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 0 48rpx;
}

.login__logo {
  width: 108rpx;
  height: 108rpx;
  border-radius: 26rpx;
  background-color: #1677ff;
  color: #ffffff;
  font-size: 52rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}

.login__title {
  font-size: 40rpx;
  font-weight: 600;
}

.login__sub {
  font-size: 24rpx;
  color: #8b949e;
  margin-top: 8rpx;
}

.login__wx {
  padding: 28rpx 28rpx 32rpx;
}

.login__wx-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.login__wx-title {
  font-size: 32rpx;
  font-weight: 600;
}

.login__wx-tag {
  font-size: 20rpx;
  color: #07c160;
  border: 1rpx solid #07c160;
  border-radius: 999rpx;
  padding: 2rpx 12rpx;
}

.login__wx-hint {
  font-size: 24rpx;
  line-height: 1.5;
}

.login__wx-warn {
  color: #d46b08;
}

.login__wx-btn {
  margin-top: 24rpx;
  background-color: #07c160;
  color: #ffffff;
  font-size: 30rpx;
  height: 84rpx;
  line-height: 84rpx;
}

.login__bind {
  margin-top: 8rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed #e5e8eb;
}

.login__code {
  letter-spacing: 8rpx;
  font-family: Consolas, Menlo, monospace;
  font-weight: 600;
}

.login__divider {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b949e;
  font-size: 22rpx;
  margin: 8rpx 0 20rpx;
}

.login__form {
  padding: 32rpx 28rpx;
}

.login__input {
  width: 100%;
  height: 78rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  font-size: 30rpx;
  background-color: #f7f8fa;
  border: 1rpx solid #e5e8eb;
  border-radius: 12rpx;
}

.login__gap {
  margin-top: 24rpx;
}

.login__hint {
  margin-top: 12rpx;
  line-height: 1.5;
  font-size: 22rpx;
}

.login__submit {
  margin-top: 36rpx;
}

.login__foot {
  text-align: center;
  margin-top: 12rpx;
}
</style>