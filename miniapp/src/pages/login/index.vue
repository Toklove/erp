<template>
  <view class="page login">
    <view class="login__brand">
      <view class="login__logo">单</view>
      <view class="login__title">业务单据</view>
      <view class="login__sub">仓库 ERP · 微信小程序端</view>
    </view>

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
import { login } from '../../api/auth';
import { getBaseUrl, getToken, setBaseUrl, setToken, setUser } from '../../api/client';

const username = ref('');
const password = ref('');
const baseUrl = ref(getBaseUrl());
const submitting = ref(false);

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
    const res = await login(name, password.value);
    setToken(res.token);
    setUser(res.user);
    uni.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/doc/list' });
    }, 300);
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
