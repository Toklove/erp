<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';

onLaunch(() => {
  // 登录态统一由各页面在 onLoad/onShow 时校验（小程序没有路由守卫）
  // 这里只打印一次环境信息，便于真机排错
  console.log('[erp-miniapp] launch');
});

onShow(() => {
  // 从后台切回前台不需要特别处理，页面自身会在 onShow 时刷新
});
</script>

<style>
/* ============ 全局基础样式（App.vue 里的样式对所有页面生效） ============ */
/* 小程序原生 button 自带边框与内边距，这里复位成普通容器（分享按钮等按 .btn 类控制外观） */
button {
  padding: 0;
  margin: 0;
  border-radius: 0;
  background-color: transparent;
  font-size: inherit;
  line-height: inherit;
}

button::after {
  border: none;
}

page {
  background-color: #f4f5f7;
  color: #1f2328;
  font-size: 28rpx;
  line-height: 1.55;
  font-family: -apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif;
}

.page {
  padding: 20rpx 24rpx 40rpx;
  box-sizing: border-box;
}

.card {
  background-color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.04);
}

.card__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2328;
  margin-bottom: 16rpx;
}

.label {
  font-size: 24rpx;
  color: #7a828c;
  margin-bottom: 8rpx;
}

.muted {
  color: #8b949e;
  font-size: 24rpx;
}

.divider {
  height: 1rpx;
  background-color: #eef0f3;
  margin: 20rpx 0;
}

/* 主按钮 */
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 82rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
  font-weight: 500;
  background-color: #ffffff;
  color: #1f2328;
  border: 1rpx solid #dfe3e8;
  margin:0 10rpx;
}

.btn--primary {
  background-color: #1677ff;
  border-color: #1677ff;
  color: #ffffff;
}

.btn--danger {
  color: #d4380d;
  border-color: #ffbb96;
}

.btn--ghost {
  background-color: #f7f8fa;
}

.btn--small {
  height: 60rpx;
  font-size: 26rpx;
  padding: 0 20rpx;
  border-radius: 10rpx;
}

.btn--disabled {
  opacity: 0.5;
}

/* 底部固定操作栏 */
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background-color: #ffffff;
  box-shadow: 0 -2rpx 12rpx rgba(15, 23, 42, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 20;
  padding: 24rpx;
}

.bottom-bar__space {
  flex: 1;
}

/* 给固定在底部的操作栏留出空间 */
.has-bottom-bar {
  padding-bottom: 150rpx;
}

/* 状态标签 */
.tag {
  display: inline-block;
  font-size: 22rpx;
  line-height: 34rpx;
  height: 36rpx;
  padding: 0 12rpx;
  border-radius: 8rpx;
  background-color: #f2f3f5;
  color: #6b7280;
}

.tag--draft {
  background-color: #f2f3f5;
  color: #6b7280;
}

.tag--audited {
  background-color: #e8f1ff;
  color: #1677ff;
}

.tag--posted {
  background-color: #e8f8ef;
  color: #0e9f6e;
}

.tag--void {
  background-color: #ffece8;
  color: #d4380d;
}

.tip {
  text-align: center;
  color: #9aa1a9;
  font-size: 24rpx;
  padding: 32rpx 0;
}

/* 数字用等宽字形，金额对齐好看 */
.num {
  font-variant-numeric: tabular-nums;
}
</style>
