<template>
  <view class="hint">
    <input
      class="hint__input"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :maxlength="maxlength"
      confirm-type="done"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
    <view v-if="visible" class="hint__panel">
      <scroll-view scroll-y class="hint__list">
        <view
          v-for="item in options"
          :key="item.value"
          class="hint__item"
          @click="pick(item.value)"
        >
          <text class="hint__item-text">{{ item.value }}</text>
          <text v-if="Number(item.cnt) > 1" class="hint__item-cnt">用过 {{ item.cnt }} 次</text>
        </view>
        <view v-if="!options.length" class="hint__empty">
          {{ loading ? '正在读取历史记录…' : '没有历史记录，直接输入即可' }}
        </view>
      </scroll-view>
      <view class="hint__foot" @click="close">收起</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { docApi, type AutocompleteItem } from '../../api/doc';

const props = withDefaults(
  defineProps<{
    /** 补全来源：summary | partner | item | spec | color | handler */
    field: string;
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    maxlength?: number;
  }>(),
  {
    modelValue: '',
    placeholder: '',
    disabled: false,
    maxlength: 60,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  /** 选中历史值时触发，父组件可借此带出规格 / 单位 / 价格 */
  (e: 'pick', value: string): void;
}>();

const options = ref<AutocompleteItem[]>([]);
const visible = ref(false);
const loading = ref(false);

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
/** 从聚焦到失焦之间不再重复拉取，避免面板不停闪 */
let focused = false;

async function search(keyword: string) {
  const my = ++seq;
  loading.value = true;
  try {
    const list = await docApi.autocomplete(props.field, keyword);
    if (my !== seq) return;
    options.value = list || [];
  } catch {
    if (my === seq) options.value = [];
  } finally {
    if (my === seq) loading.value = false;
  }
}

function scheduleSearch(keyword: string) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void search(keyword);
  }, 220);
}

function onInput(e: { detail: { value: string } }) {
  const value = e.detail.value;
  emit('update:modelValue', value);
  visible.value = true;
  scheduleSearch(value);
}

function onFocus() {
  focused = true;
  if (!visible.value) visible.value = true;
  if (!options.value.length) void search(props.modelValue || '');
}

function onBlur() {
  focused = false;
  // 点选历史值也会先触发 blur。延迟关闭，留出点击时间（真机上 click 比 blur 晚一点）
  setTimeout(() => {
    if (!focused) visible.value = false;
  }, 180);
}

function pick(value: string) {
  if (timer) clearTimeout(timer);
  emit('update:modelValue', value);
  emit('pick', value);
  visible.value = false;
}

function close() {
  visible.value = false;
}
</script>

<style scoped>
.hint {
  width: 100%;
}

.hint__input {
  width: 100%;
  height: 72rpx;
  padding: 0 16rpx;
  box-sizing: border-box;
  font-size: 28rpx;
  background-color: #f7f8fa;
  border: 1rpx solid #e5e8eb;
  border-radius: 10rpx;
}

.hint__panel {
  margin-top: 8rpx;
  border: 1rpx solid #e5e8eb;
  border-radius: 10rpx;
  background-color: #ffffff;
  overflow: hidden;
}

.hint__list {
  max-height: 360rpx;
}

.hint__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 16rpx;
  border-bottom: 1rpx solid #f2f3f5;
}

.hint__item-text {
  font-size: 27rpx;
  color: #1f2328;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hint__item-cnt {
  font-size: 22rpx;
  color: #b0b7bf;
  margin-left: 12rpx;
}

.hint__empty {
  padding: 24rpx 16rpx;
  font-size: 24rpx;
  color: #9aa1a9;
}

.hint__foot {
  padding: 14rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: #1677ff;
  background-color: #fafbfc;
}
</style>
