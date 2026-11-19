<template>
  <view class="page">
    <view v-if="loading" class="empty">
      <view class="muted">正在加载…</view>
    </view>

    <view v-else-if="!doc" class="empty">
      <view class="empty__icon">🔍</view>
      <view class="empty__text">单据不存在</view>
    </view>

    <block v-else>
      <!-- 单据纸张 -->
      <view class="sheet">
        <view class="sheet__title">{{ COMPANY.name }}{{ doc.docTypeName || '销售单' }}</view>
        <view class="sheet__rule" />

        <view class="sheet__meta">
          <view class="sheet__meta-col">
            <view class="sheet__meta-row">
              <text class="sheet__meta-label">发货仓库：</text>
              <text class="sheet__meta-value">{{ doc.warehouseName || '' }}</text>
            </view>
            <view class="sheet__meta-row">
              <text class="sheet__meta-label">客户名称：</text>
              <text class="sheet__meta-value">{{ doc.partnerName || '' }}</text>
            </view>
            <view class="sheet__meta-row">
              <text class="sheet__meta-label">联系地址：</text>
              <text class="sheet__meta-value">{{ doc.contactAddress || '' }}</text>
            </view>
          </view>
          <view class="sheet__meta-col">
            <view class="sheet__meta-row">
              <text class="sheet__meta-label">录单日期：</text>
              <text class="sheet__meta-value">{{ doc.bizDate || '' }}</text>
            </view>
            <view class="sheet__meta-row">
              <text class="sheet__meta-label">单据编号：</text>
              <text class="sheet__meta-value">{{ doc.docNo || '' }}</text>
            </view>
            <view class="sheet__meta-row">
              <text class="sheet__meta-label">联系电话：</text>
              <text class="sheet__meta-value">{{ doc.contactPhone || '' }}</text>
            </view>
            <view class="sheet__meta-row">
              <text class="sheet__meta-label">摘　　要：</text>
              <text class="sheet__meta-value">{{ doc.summary || '' }}</text>
            </view>
          </view>
        </view>

        <!-- 明细表 -->
        <view class="tbl">
          <view class="tbl__row tbl__head">
            <text class="tbl__cell tbl__c-no">行号</text>
            <text class="tbl__cell tbl__c-name">存货名称</text>
            <text class="tbl__cell tbl__c-unit">单位</text>
            <text class="tbl__cell tbl__c-qty">数量</text>
            <text class="tbl__cell tbl__c-price">单价</text>
            <text class="tbl__cell tbl__c-amt">金额</text>
          </view>

          <view v-for="(line, index) in lines" :key="line.id || index" class="tbl__row">
            <text class="tbl__cell tbl__c-no">{{ index + 1 }}</text>
            <view class="tbl__c-name">
              <text class="tbl__name">{{ line.itemName || '' }}</text>
              <text v-if="line.itemSpec || line.itemColor" class="tbl__spec">
                {{ [line.itemSpec, line.itemColor].filter(Boolean).join(' / ') }}
              </text>
              <text v-if="line.remark" class="tbl__spec">备注：{{ line.remark }}</text>
            </view>
            <text class="tbl__cell tbl__c-unit">{{ line.unitName || '' }}</text>
            <text class="tbl__cell tbl__c-qty">{{ fmtQty(line.qty) }}</text>
            <text class="tbl__cell tbl__c-price">{{ fmtMoney(line.price) }}</text>
            <text class="tbl__cell tbl__c-amt">{{ fmtMoney(line.amount) }}</text>
          </view>

          <view v-if="!lines.length" class="tbl__empty muted">没有明细</view>
        </view>

        <!-- 合计 -->
        <view class="sheet__foot">
          <view class="sheet__foot-line">
            <text>合计：<text class="sheet__strong">{{ toChineseAmount(doc.totalAmount) }}</text></text>
          </view>
          <view class="sheet__foot-line">
            <text>合计金额：<text class="sheet__strong">¥{{ fmtMoney(doc.totalAmount) }}</text></text>
          </view>
          <view class="sheet__foot-line">
            <text>已收金额：<text class="sheet__strong">¥{{ fmtMoney(doc.paidAmount) }}</text></text>
          </view>
          <view class="sheet__foot-line">
            <text>欠款金额：<text class="sheet__strong">¥{{ fmtMoney(unpaid) }}</text></text>
          </view>
          <view class="sheet__foot-line">
            <text>备注：{{ doc.remark || '' }}</text>
          </view>
          <view class="sheet__foot-line">
            <text>收款账户：{{ COMPANY.bankAccount || '＿＿＿＿＿＿＿＿＿＿＿＿' }}</text>
          </view>
          <view class="sheet__foot-line">
            <text>地址：{{ COMPANY.address }}</text>
          </view>
        </view>

        <view class="sheet__sign">
          <text class="sheet__sign-item">制单人：{{ doc.creatorName || '' }}</text>
          <text class="sheet__sign-item">经手人：{{ doc.handler || '' }}</text>
          <text class="sheet__sign-item">客户签字：＿＿＿＿＿</text>
        </view>

        <view class="sheet__print-count muted">本单据已打印 {{ doc.printCount ?? 0 }} 次</view>
      </view>

      <view class="tip muted">
        小程序内为单据预览版式；如需纸质打印，请在电脑端 Web 打开同一单据打印。
      </view>
    </block>

    <view v-if="doc" class="bottom-bar">
      <view class="btn bottom-bar__btn" :class="{ 'btn--disabled': recording }" @click="recordPrint">
        {{ recording ? '记录中…' : '记一次打印' }}
      </view>
      <button class="btn btn--primary bottom-bar__btn" open-type="share">分享单据</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { ensureLogin } from '../../api/client';
import { docApi, type DocHead, type DocLine } from '../../api/doc';
import { COMPANY } from '../../config/company';
import { fmtMoney, fmtQty, toChineseAmount } from '../../utils/format';

const doc = ref<DocHead | null>(null);
const loading = ref(true);
const recording = ref(false);
let docId = 0;

const lines = computed<DocLine[]>(() => doc.value?.lines || []);
const unpaid = computed(() => Number(doc.value?.totalAmount || 0) - Number(doc.value?.paidAmount || 0));

async function fetchDetail() {
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

/** 与 Web 端行为一致：点「打印」时累加打印次数 */
async function recordPrint() {
  if (recording.value || !docId) return;
  recording.value = true;
  try {
    const res = await docApi.printed(docId);
    if (doc.value) doc.value.printCount = res?.printCount ?? (Number(doc.value.printCount) || 0) + 1;
    uni.showToast({ title: '已记录打印次数', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message || '记录失败', icon: 'none' });
  } finally {
    recording.value = false;
  }
}

onShareAppMessage(() => ({
  title: `${doc.value?.docTypeName || '单据'} ${doc.value?.docNo || ''}`.trim(),
  path: `/pages/doc/view?id=${docId}`,
}));

onLoad((query) => {
  if (!ensureLogin()) return;
  docId = Number((query as Record<string, string> | undefined)?.id || 0);
  if (!docId) {
    loading.value = false;
    return;
  }
  void fetchDetail();
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

.sheet {
  margin: 20rpx 24rpx 0;
  padding: 32rpx 24rpx 28rpx;
  background-color: #ffffff;
  border: 1rpx solid #dfe3e8;
  border-radius: 6rpx;
  box-shadow: 0 4rpx 20rpx rgba(15, 23, 42, 0.06);
}

.sheet__title {
  text-align: center;
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  color: #1f2328;
}

.sheet__rule {
  height: 3rpx;
  margin: 10rpx 0 18rpx;
  background-color: #1f2328;
}

.sheet__meta {
  display: flex;
  flex-wrap: wrap;
}

.sheet__meta-col {
  width: 50%;
  box-sizing: border-box;
}

.sheet__meta-col:first-child {
  padding-right: 12rpx;
}

.sheet__meta-row {
  display: flex;
  align-items: flex-start;
  padding: 4rpx 0;
  font-size: 22rpx;
  line-height: 1.5;
}

.sheet__meta-label {
  color: #6b7280;
  flex-shrink: 0;
}

.sheet__meta-value {
  color: #1f2328;
  flex: 1;
  word-break: break-all;
}

.tbl {
  margin-top: 16rpx;
  border-top: 2rpx solid #1f2328;
  border-left: 1rpx solid #1f2328;
}

.tbl__row {
  display: flex;
  align-items: stretch;
  border-bottom: 1rpx solid #1f2328;
}

.tbl__head {
  background-color: #f5f6f7;
  font-weight: 600;
}

.tbl__cell {
  padding: 8rpx 6rpx;
  box-sizing: border-box;
  border-right: 1rpx solid #1f2328;
  font-size: 22rpx;
  line-height: 1.45;
  color: #1f2328;
  word-break: break-all;
}

.tbl__head .tbl__cell {
  text-align: center;
  font-size: 22rpx;
}

.tbl__c-no {
  width: 9%;
  text-align: center;
  flex-shrink: 0;
}

.tbl__c-name {
  width: 33%;
  flex-shrink: 0;
  padding: 8rpx 6rpx;
  box-sizing: border-box;
  border-right: 1rpx solid #1f2328;
}

.tbl__c-unit {
  width: 10%;
  text-align: center;
  flex-shrink: 0;
}

.tbl__c-qty {
  width: 12%;
  text-align: right;
  flex-shrink: 0;
}

.tbl__c-price {
  width: 15%;
  text-align: right;
  flex-shrink: 0;
}

.tbl__c-amt {
  width: 21%;
  text-align: right;
  flex-shrink: 0;
  border-right: 1rpx solid #1f2328;
}

.tbl__head .tbl__c-amt {
  border-right: 1rpx solid #1f2328;
}

.tbl__name {
  display: block;
  font-size: 22rpx;
  color: #1f2328;
  line-height: 1.45;
}

.tbl__spec {
  display: block;
  font-size: 19rpx;
  color: #8b949e;
  line-height: 1.4;
}

.tbl__empty {
  padding: 24rpx 0;
  text-align: center;
  font-size: 22rpx;
  border-right: 1rpx solid #1f2328;
}

.sheet__foot {
  margin-top: 16rpx;
}

.sheet__foot-line {
  padding: 3rpx 0;
  font-size: 22rpx;
  color: #1f2328;
  line-height: 1.6;
}

.sheet__strong {
  font-weight: 700;
}

.sheet__sign {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-top: 22rpx;
  padding-top: 12rpx;
  border-top: 1rpx dashed #d0d7de;
}

.sheet__sign-item {
  font-size: 22rpx;
  color: #1f2328;
  padding: 6rpx 0;
}

.sheet__print-count {
  margin-top: 10rpx;
  font-size: 20rpx;
  text-align: right;
}

.tip {
  padding: 20rpx 32rpx 0;
  font-size: 22rpx;
  line-height: 1.6;
  text-align: center;
}

.bottom-bar__btn {
  flex: 1;
  /* margin: 0; */
}
</style>
