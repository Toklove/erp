<template>
  <view class="page has-bottom-bar">
    <!-- 搜索与筛选 -->
    <view class="filters">
      <view class="filters__search">
        <input
          v-model="keyword"
          class="filters__input"
          placeholder="单号 / 往来单位 / 摘要"
          confirm-type="search"
          :maxlength="40"
          @confirm="reload"
        />
        <view v-if="keyword" class="filters__clear" @click="clearKeyword">清除</view>
      </view>

      <view class="filters__row">
        <picker mode="selector" :range="typeLabels" :value="typeIndex" @change="onTypeChange">
          <view class="chip" :class="{ 'chip--on': typeIndex > 0 }">{{ typeLabels[typeIndex] }} ▾</view>
        </picker>
        <picker mode="selector" :range="statusLabels" :value="statusIndex" @change="onStatusChange">
          <view class="chip" :class="{ 'chip--on': statusIndex > 0 }">{{ statusLabels[statusIndex] }} ▾</view>
        </picker>
        <view class="chip" :class="{ 'chip--on': dateOpen || hasDate }" @click="toggleDate">
          日期 ▾
        </view>
        <view class="chip chip--reset" @click="resetFilters">重置</view>
      </view>

      <view v-if="dateOpen" class="filters__dates">
        <picker mode="date" :value="dateFrom" @change="onDateFrom">
          <view class="date-box">{{ dateFrom || '开始日期' }}</view>
        </picker>
        <text class="muted filters__dash">至</text>
        <picker mode="date" :value="dateTo" @change="onDateTo">
          <view class="date-box">{{ dateTo || '结束日期' }}</view>
        </picker>
        <view class="date-box date-box--go" @click="applyDate">确定</view>
      </view>
    </view>

    <!-- 统计条 -->
    <view class="list-head">
      <text class="muted">共 {{ total }} 张单据</text>
      <text class="muted">
        {{ loading ? '加载中…' : finished ? '已到底' : '上拉加载更多' }}
      </text>
    </view>

    <!-- 列表 -->
    <view v-if="rows.length" class="list">
      <view v-for="item in rows" :key="item.id" class="doc" @click="openDetail(item.id)">
        <view class="doc__top">
          <text class="doc__no">{{ item.docNo }}</text>
          <text :class="['tag', 'tag--' + statusOf(item.status).key]">
            {{ statusOf(item.status).text }}
          </text>
        </view>

        <view class="doc__row">
          <text class="doc__type">{{ item.docTypeName || '—' }}</text>
          <text class="muted doc__date">{{ item.bizDate || '—' }}</text>
        </view>

        <view v-if="item.partnerName" class="doc__row">
          <text class="doc__partner">{{ item.partnerName }}</text>
        </view>

        <view class="doc__bottom">
          <text class="muted doc__meta">
            {{ item.warehouseName || '未选仓库' }} · {{ item.handler || item.creatorName || '—' }}
          </text>
          <text class="num doc__amount">¥{{ fmtMoney(item.totalAmount) }}</text>
        </view>
      </view>
    </view>

    <view v-else-if="loading" class="empty">
      <view class="muted">正在加载…</view>
    </view>

    <view v-else class="empty">
      <view class="empty__icon">🗂</view>
      <view class="empty__text">还没有符合条件的单据</view>
      <view class="muted">可以清空条件后重试，或点下方「新建单据」</view>
    </view>

    <!-- 底部操作条 -->
    <view class="bottom-bar">
      <view class="btn btn--primary bottom-bar__btn" @click="createDoc">＋ 新建单据</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { ensureLogin } from '../../api/client';
import { docApi, type DocHead, type DocTypeOption } from '../../api/doc';
import { fmtMoney, statusOf, STATUS_OPTIONS } from '../../utils/format';

const PAGE_SIZE = 20;

const keyword = ref('');
const types = ref<DocTypeOption[]>([]);
const typeIndex = ref(0);
const statusIndex = ref(0);
const dateFrom = ref('');
const dateTo = ref('');
const dateOpen = ref(false);

const rows = ref<DocHead[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const finished = ref(false);
const loaded = ref(false);

let firstShow = true;

const typeLabels = computed(() => ['全部类型', ...types.value.map((t) => t.name)]);
const statusLabels = computed(() => ['全部状态', ...STATUS_OPTIONS.map((s) => s.label)]);
const hasDate = computed(() => Boolean(dateFrom.value || dateTo.value));

function currentType(): string | undefined {
  const t = types.value[typeIndex.value - 1];
  return typeIndex.value > 0 ? t?.code : undefined;
}

function currentStatus(): number | undefined {
  return statusIndex.value > 0 ? STATUS_OPTIONS[statusIndex.value - 1].value : undefined;
}

async function load(reset = false) {
  if (loading.value) return;
  if (!reset && finished.value) return;

  loading.value = true;
  const targetPage = reset ? 1 : page.value + 1;
  try {
    const res = await docApi.page({
      keyword: keyword.value.trim() || undefined,
      docType: currentType(),
      status: currentStatus(),
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
      page: targetPage,
      pageSize: PAGE_SIZE,
    });
    const list = res.rows || [];
    rows.value = reset ? list : rows.value.concat(list);
    total.value = res.total || 0;
    page.value = targetPage;
    finished.value = rows.value.length >= total.value || list.length < PAGE_SIZE;
    loaded.value = true;
  } catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none', duration: 2500 });
  } finally {
    loading.value = false;
  }
}

function reload() {
  dateOpen.value = false;
  finished.value = false;
  void load(true);
  if (typeof uni !== 'undefined' && keyword.value) uni.hideKeyboard();
}

function clearKeyword() {
  keyword.value = '';
  reload();
}

function onTypeChange(e: { detail: { value: string } }) {
  typeIndex.value = Number(e.detail.value) || 0;
  reload();
}

function onStatusChange(e: { detail: { value: string } }) {
  statusIndex.value = Number(e.detail.value) || 0;
  reload();
}

function toggleDate() {
  dateOpen.value = !dateOpen.value;
}

function onDateFrom(e: { detail: { value: string } }) {
  dateFrom.value = e.detail.value;
}

function onDateTo(e: { detail: { value: string } }) {
  dateTo.value = e.detail.value;
}

function applyDate() {
  if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
    const tmp = dateFrom.value;
    dateFrom.value = dateTo.value;
    dateTo.value = tmp;
  }
  reload();
}

function resetFilters() {
  keyword.value = '';
  typeIndex.value = 0;
  statusIndex.value = 0;
  dateFrom.value = '';
  dateTo.value = '';
  dateOpen.value = false;
  reload();
}

function openDetail(id?: number) {
  if (id === undefined || id === null) return;
  uni.navigateTo({ url: `/pages/doc/view?id=${id}` });
}

function createDoc() {
  uni.navigateTo({ url: '/pages/doc/edit' });
}

onLoad(() => {
  // 没登录先去登录页，避免无 token 直接打 401
  if (!ensureLogin()) return;
  // 单据类型用于筛选与新建，失败不影响列表
  docApi
    .types()
    .then((list) => {
      types.value = list || [];
      if (!typeIndex.value && types.value.length === 1) {
        // 只有一种单据时直接选中，减少一次点击
        typeIndex.value = 1;
        void load(true);
      }
    })
    .catch(() => undefined);
  void load(true);
});

onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  // 从详情 / 编辑页返回时刷新，保证状态与列表同步
  if (loaded.value) {
    finished.value = false;
    void load(true);
  }
});

onPullDownRefresh(async () => {
  finished.value = false;
  await load(true);
  uni.stopPullDownRefresh();
});

onReachBottom(() => {
  if (!finished.value && !loading.value) void load(false);
});
</script>

<style scoped>
.filters {
  padding: 16rpx 24rpx 8rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #ebeef2;
}

.filters__search {
  position: relative;
}

.filters__input {
  width: 100%;
  height: 72rpx;
  padding: 0 88rpx 0 20rpx;
  box-sizing: border-box;
  font-size: 27rpx;
  background-color: #f4f5f7;
  border-radius: 36rpx;
}

.filters__clear {
  position: absolute;
  right: 24rpx;
  top: 0;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 24rpx;
  color: #1677ff;
}

.filters__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 14rpx 0 4rpx;
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 52rpx;
  padding: 0 18rpx;
  margin: 6rpx 14rpx 6rpx 0;
  font-size: 24rpx;
  color: #4b5563;
  background-color: #f4f5f7;
  border-radius: 26rpx;
}

.chip--on {
  color: #1677ff;
  background-color: #e8f1ff;
}

.chip--reset {
  color: #8b949e;
  margin-right: 0;
}

.filters__dates {
  display: flex;
  align-items: center;
  padding: 8rpx 0 16rpx;
}

.date-box {
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 18rpx;
  font-size: 26rpx;
  color: #1f2328;
  background-color: #f4f5f7;
  border-radius: 10rpx;
}

.date-box--go {
  margin-left: auto;
  color: #ffffff;
  background-color: #1677ff;
}

.filters__dash {
  margin: 0 14rpx;
  font-size: 24rpx;
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx 8rpx;
  font-size: 22rpx;
}

.doc {
  margin: 16rpx 24rpx 0;
  padding: 22rpx 24rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(15, 23, 42, 0.04);
}

.doc__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.doc__no {
  font-size: 30rpx;
  font-weight: 600;
  color: #1f2328;
  letter-spacing: 0.5rpx;
}

.doc__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10rpx;
}

.doc__type {
  font-size: 26rpx;
  color: #374151;
}

.doc__partner {
  font-size: 26rpx;
  color: #6b7280;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.doc__date {
  font-size: 24rpx;
}

.doc__bottom {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 1rpx dashed #ebeef2;
}

.doc__meta {
  font-size: 22rpx;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.doc__amount {
  font-size: 30rpx;
  font-weight: 600;
  color: #d4380d;
  margin-left: 16rpx;
}

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

.bottom-bar__btn {
  flex: 1;
  /* margin: 0; */
}
</style>
