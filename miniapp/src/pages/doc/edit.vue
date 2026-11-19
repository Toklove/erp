<template>
  <view class="page has-bottom-bar">
    <view v-if="loadingDoc" class="empty">
      <view class="muted">正在加载…</view>
    </view>

    <block v-else>
      <!-- 单据头 -->
      <view class="card">
        <view class="section-title">
          {{ editing ? '编辑单据' : '新建单据' }}
          <text v-if="docNo" class="muted section-no">{{ docNo }}</text>
        </view>

        <view class="field">
          <view class="label">单据类型 <text class="star">*</text></view>
          <picker
            v-if="!editing"
            mode="selector"
            :range="typeLabels"
            :value="typeIndex"
            @change="onTypeChange"
          >
            <view class="picker-box">{{ currentType ? currentType.name : '请选择单据类型' }}</view>
          </picker>
          <view v-else class="picker-box picker-box--readonly">{{ currentType ? currentType.name : '—' }}</view>
        </view>

        <view class="field">
          <view class="label">业务日期 <text class="star">*</text></view>
          <picker mode="date" :value="bizDate" @change="onDateChange">
            <view class="picker-box">{{ bizDate || '请选择日期' }}</view>
          </picker>
        </view>

        <view class="field">
          <view class="label">单号</view>
          <view class="picker-box picker-box--readonly">{{ docNo || '保存后自动生成' }}</view>
        </view>
      </view>

      <!-- 往来与仓库 -->
      <view class="card">
        <view class="section-title">往来单位与仓库</view>

        <view class="field">
          <view class="label">往来单位</view>
          <hint-input
            v-model="partnerName"
            field="partner"
            placeholder="输入或选择往来单位"
            @pick="onPickPartner"
          />
        </view>

        <view class="field">
          <view class="label">联系电话</view>
          <input v-model="contactPhone" class="input" placeholder="选填" :maxlength="32" />
        </view>

        <view class="field">
          <view class="label">收货地址</view>
          <input v-model="contactAddress" class="input" placeholder="选填" :maxlength="120" />
        </view>

        <view class="field">
          <view class="label">仓库</view>
          <picker mode="selector" :range="warehouseLabels" :value="warehouseIndex" @change="onWarehouseChange">
            <view class="picker-box">{{ warehouseName || '请选择仓库' }}</view>
          </picker>
        </view>

        <view class="field">
          <view class="label">经办人</view>
          <hint-input v-model="handler" field="handler" placeholder="输入或选择经办人" />
        </view>

        <view class="field">
          <view class="label">部门</view>
          <input v-model="department" class="input" placeholder="选填" :maxlength="64" />
        </view>

        <view class="field">
          <view class="label">摘要</view>
          <hint-input v-model="summary" field="summary" placeholder="输入或选择摘要" />
        </view>

        <view class="field">
          <view class="label">备注</view>
          <textarea
            v-model="remark"
            class="textarea"
            placeholder="选填，最多 255 字"
            :maxlength="255"
            auto-height
          />
        </view>
      </view>

      <!-- 明细 -->
      <view class="card">
        <view class="section-title">
          单据明细 <text class="star">*</text>
          <text class="muted section-count">{{ activeLines }} 项</text>
        </view>

        <view v-for="(line, index) in lines" :key="line.key" class="line-edit">
          <view class="line-edit__head">
            <text class="line-edit__no">第 {{ index + 1 }} 行</text>
            <text class="line-edit__del" @click="removeLine(index)">删除</text>
          </view>

          <view class="field">
            <view class="label">存货名称</view>
            <hint-input
              v-model="line.itemName"
              field="item"
              placeholder="输入存货名称，自动带出规格 / 单位 / 价格"
              @pick="(value) => onPickItem(index, value)"
            />
          </view>

          <view class="line-edit__row">
            <view class="field line-edit__col">
              <view class="label">规格</view>
              <hint-input v-model="line.itemSpec" field="spec" placeholder="规格" />
            </view>
            <view class="field line-edit__col">
              <view class="label">颜色</view>
              <hint-input v-model="line.itemColor" field="color" placeholder="颜色" />
            </view>
          </view>

          <view class="line-edit__row">
            <view class="field line-edit__col">
              <view class="label">单位</view>
              <input v-model="line.unitName" class="input" placeholder="件 / 个" :maxlength="32" />
            </view>
            <view class="field line-edit__col">
              <view class="label">数量</view>
              <input v-model="line.qty" class="input" type="digit" placeholder="0" />
            </view>
          </view>

          <view class="line-edit__row">
            <view class="field line-edit__col">
              <view class="label">单价</view>
              <input v-model="line.price" class="input" type="digit" placeholder="0.00" />
            </view>
            <view class="field line-edit__col">
              <view class="label">金额</view>
              <view class="picker-box picker-box--readonly num">¥{{ fmtMoney(amountOf(Number(line.qty), Number(line.price))) }}</view>
            </view>
          </view>

          <view class="field">
            <view class="label">行备注</view>
            <input v-model="line.remark" class="input" placeholder="选填" :maxlength="255" />
          </view>
        </view>

        <view class="line-add" @click="addLine">＋ 添加一行</view>

        <!-- 合计 -->
        <view class="sum">
          <view class="sum__row">
            <text class="muted">合计数量</text>
            <text class="num">{{ fmtQty(totalQty) }}</text>
          </view>
          <view class="sum__row">
            <text class="muted">合计金额</text>
            <text class="num sum__amount">¥{{ fmtMoney(totalAmount) }}</text>
          </view>
          <view class="sum__row sum__row--input">
            <text class="muted">已收金额</text>
            <input v-model="paidAmount" class="input sum__input" type="digit" placeholder="0.00" />
          </view>
          <view class="sum__row">
            <text class="muted">欠款</text>
            <text class="num sum__debt">¥{{ fmtMoney(unpaid) }}</text>
          </view>
          <view class="sum__cn muted">大写：{{ toChineseAmount(totalAmount) }}</view>
        </view>
      </view>
    </block>

    <!-- 底部操作 -->
    <view class="bottom-bar">
      <view class="btn bottom-bar__btn" @click="cancel">取 消</view>
      <view
        class="btn btn--primary bottom-bar__btn"
        :class="{ 'btn--disabled': saving }"
        @click="save"
      >
        {{ saving ? '保存中…' : '保 存' }}
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { ensureLogin } from '../../api/client';
import {
  docApi,
  mdApi,
  type DocHead,
  type DocTypeOption,
  type WarehouseOption,
} from '../../api/doc';
import { amountOf, fmtMoney, fmtQty, today, toChineseAmount } from '../../utils/format';

interface EditLine {
  key: string;
  itemId?: number;
  itemName: string;
  itemSpec: string;
  itemColor: string;
  unitName: string;
  qty: string;
  price: string;
  remark: string;
}

const editing = ref(false);
const loadingDoc = ref(false);
const saving = ref(false);
let editId = 0;
let lineSeed = 0;

const types = ref<DocTypeOption[]>([]);
const typeIndex = ref(0);
const bizDate = ref(today());
const docNo = ref('');
const partnerId = ref(0);
const partnerName = ref('');
const contactPhone = ref('');
const contactAddress = ref('');
const warehouses = ref<WarehouseOption[]>([]);
const warehouseIndex = ref(-1);
const warehouseId = ref(0);
const warehouseName = ref('');
const handler = ref('');
const department = ref('');
const summary = ref('');
const remark = ref('');
const paidAmount = ref('0');
const lines = ref<EditLine[]>([]);

const typeLabels = computed(() => types.value.map((t) => t.name));
const currentType = computed<DocTypeOption | undefined>(() => types.value[typeIndex.value]);
const warehouseLabels = computed(() => warehouses.value.map((w) => w.name));

const activeLines = computed(() =>
  lines.value.filter((l) => l.itemName.trim()).length,
);
const totalQty = computed(() =>
  lines.value.reduce((sum, l) => sum + (Number(l.qty) || 0), 0),
);
const totalAmount = computed(() =>
  lines.value.reduce((sum, l) => sum + amountOf(Number(l.qty), Number(l.price)), 0),
);
const unpaid = computed(() => totalAmount.value - (Number(paidAmount.value) || 0));

function newLine(): EditLine {
  lineSeed += 1;
  return {
    key: `l${lineSeed}`,
    itemName: '',
    itemSpec: '',
    itemColor: '',
    unitName: '',
    qty: '',
    price: '',
    remark: '',
  };
}

function addLine() {
  lines.value.push(newLine());
}

function removeLine(index: number) {
  if (lines.value.length <= 1) {
    // 至少保留一行，清空即可
    const line = lines.value[0];
    if (line) {
      line.itemName = '';
      line.itemSpec = '';
      line.itemColor = '';
      line.unitName = '';
      line.qty = '';
      line.price = '';
      line.remark = '';
    }
    return;
  }
  lines.value.splice(index, 1);
}

function onTypeChange(e: { detail: { value: string } }) {
  typeIndex.value = Number(e.detail.value) || 0;
}

function onDateChange(e: { detail: { value: string } }) {
  bizDate.value = e.detail.value || today();
}

function onWarehouseChange(e: { detail: { value: string } }) {
  const index = Number(e.detail.value);
  const hit = warehouses.value[index];
  if (!hit) return;
  warehouseIndex.value = index;
  warehouseId.value = hit.id;
  warehouseName.value = hit.name;
}

async function loadTypes() {
  types.value = (await docApi.types()) || [];
  if (!typeIndex.value && types.value.length > 1) typeIndex.value = 0;
}

async function loadWarehouses() {
  warehouses.value = (await mdApi.warehouses()) || [];
  if (warehouseIndex.value < 0 && warehouses.value.length === 1) {
    const only = warehouses.value[0];
    warehouseIndex.value = 0;
    warehouseId.value = only.id;
    warehouseName.value = only.name;
  }
}

async function loadDetail() {
  const d = await docApi.detail(editId);
  docNo.value = d.docNo || '';
  bizDate.value = d.bizDate || today();
  partnerId.value = Number(d.partnerId) || 0;
  partnerName.value = d.partnerName || '';
  contactPhone.value = d.contactPhone || '';
  contactAddress.value = d.contactAddress || '';
  warehouseId.value = Number(d.warehouseId) || 0;
  warehouseName.value = d.warehouseName || '';
  handler.value = d.handler || '';
  department.value = d.department || '';
  summary.value = d.summary || '';
  remark.value = d.remark || '';
  paidAmount.value = String(Number(d.paidAmount) || 0);

  const typeIdx = types.value.findIndex((t) => t.code === d.docTypeCode);
  if (typeIdx >= 0) typeIndex.value = typeIdx;
  const whIdx = warehouses.value.findIndex((w) => w.id === Number(d.warehouseId));
  if (whIdx >= 0) warehouseIndex.value = whIdx;

  lines.value = (d.lines || []).map((l) => {
    const item = newLine();
    item.itemId = l.itemId;
    item.itemName = l.itemName || '';
    item.itemSpec = l.itemSpec || '';
    item.itemColor = l.itemColor || '';
    item.unitName = l.unitName || '';
    item.qty = l.qty === undefined || l.qty === null ? '' : String(Number(l.qty));
    item.price = l.price === undefined || l.price === null ? '' : String(Number(l.price));
    item.remark = l.remark || '';
    return item;
  });
  // 历史单据可能没有明细（如从管家婆导入的空单），保持至少一行可编辑，避免只能点「添加一行」
  if (!lines.value.length) lines.value = [newLine()];
}

/** 选中历史往来单位时，带出电话 / 地址 / id */
async function onPickPartner(name: string) {
  partnerName.value = name;
  try {
    const list = await mdApi.partners(name);
    const hit = (list || []).find((p) => p.name === name) || (list || [])[0];
    if (!hit) return;
    if (!partnerId.value) partnerId.value = hit.id;
    if (!contactPhone.value && hit.phone) contactPhone.value = hit.phone;
    if (!contactAddress.value && hit.address) contactAddress.value = hit.address;
  } catch {
    /* 带出失败不影响手工填写 */
  }
}

/** 选中存货时，把规格 / 颜色 / 单位 / 价格按历史记录补空 */
async function onPickItem(index: number, name: string) {
  const line = lines.value[index];
  if (!line || !name) return;
  try {
    const hint = await docApi.itemHint(name);
    if (!hint) return;
    if (!line.itemSpec && hint.itemSpec) line.itemSpec = hint.itemSpec;
    if (!line.itemColor && hint.itemColor) line.itemColor = hint.itemColor;
    if (!line.unitName && hint.unitName) line.unitName = hint.unitName;
    if (Number(line.price) === 0 && hint.price !== undefined && hint.price !== null) {
      line.price = String(Number(hint.price));
    }
  } catch {
    /* 带出失败不影响手工填写 */
  }
}

function validate(): string | null {
  if (!currentType.value) return '请选择单据类型';
  if (!bizDate.value) return '请选择业务日期';
  if (!partnerName.value.trim()) return '请填写往来单位';
  if (!warehouseId.value) return '请选择仓库';

  const filled = lines.value.filter((l) => l.itemName.trim());
  if (!filled.length) return '请至少填写一行明细';
  for (let i = 0; i < filled.length; i++) {
    const idx = lines.value.indexOf(filled[i]) + 1;
    if (Number(filled[i].qty) <= 0) return `第 ${idx} 行：数量必须大于 0`;
    if (Number(filled[i].price) < 0) return `第 ${idx} 行：单价不能为负数`;
  }

  const paid = Number(paidAmount.value);
  if (Number.isNaN(paid) || paid < 0) return '已收金额填写有误';
  return null;
}

function buildPayload(): DocHead {
  const t = currentType.value;
  return {
    docTypeCode: t?.code || '',
    docTypeName: t?.name || '',
    bizDate: bizDate.value,
    partnerId: partnerId.value,
    partnerName: partnerName.value.trim(),
    contactPhone: contactPhone.value.trim(),
    contactAddress: contactAddress.value.trim(),
    warehouseId: warehouseId.value,
    warehouseName: warehouseName.value,
    summary: summary.value.trim(),
    handler: handler.value.trim(),
    department: department.value.trim(),
    remark: remark.value.trim(),
    paidAmount: Number(paidAmount.value) || 0,
    lines: lines.value
      .filter((l) => l.itemName.trim())
      .map((l, i) => ({
        lineNo: i + 1,
        itemId: l.itemId,
        itemName: l.itemName.trim(),
        itemSpec: l.itemSpec.trim(),
        itemColor: l.itemColor.trim(),
        unitName: l.unitName.trim(),
        qty: Number(l.qty) || 0,
        price: Number(l.price) || 0,
        amount: amountOf(Number(l.qty), Number(l.price)),
        remark: l.remark.trim(),
        warehouseId: warehouseId.value,
        warehouseName: warehouseName.value,
      })),
  };
}

async function save() {
  if (saving.value) return;
  const error = validate();
  if (error) {
    uni.showToast({ title: error, icon: 'none', duration: 2500 });
    return;
  }

  saving.value = true;
  uni.showLoading({ title: '保存中…', mask: true });
  try {
    const payload = buildPayload();
    if (editing.value) {
      await docApi.update(editId, payload);
      uni.hideLoading();
      uni.showToast({ title: '保存成功', icon: 'success' });
    } else {
      const res = await docApi.create(payload);
      uni.hideLoading();
      uni.showToast({ title: `已创建 ${res.docNo || ''}`.trim(), icon: 'none', duration: 2000 });
    }
    setTimeout(() => uni.navigateBack(), 700);
  } catch (e) {
    uni.hideLoading();
    uni.showModal({
      title: '保存失败',
      content: (e as Error).message || '请检查填写内容后重试',
      showCancel: false,
    });
  } finally {
    saving.value = false;
  }
}

function cancel() {
  if (saving.value) return;
  uni.navigateBack();
}

onLoad(async (query) => {
  if (!ensureLogin()) return;
  const id = Number((query as Record<string, string> | undefined)?.id || 0);
  editing.value = id > 0;
  editId = id;

  lines.value = [newLine()];
  loadingDoc.value = true;

  try {
    await Promise.all([loadTypes(), loadWarehouses()]);
    if (editing.value) {
      await loadDetail();
    }
    uni.setNavigationBarTitle({ title: editing.value ? '编辑单据' : '新建单据' });
  } catch (e) {
    uni.showModal({
      title: '加载失败',
      content: (e as Error).message || '请返回重试',
      showCancel: false,
      success: () => uni.navigateBack(),
    });
  } finally {
    loadingDoc.value = false;
  }
});
</script>

<style scoped>
.empty {
  padding: 120rpx 40rpx;
  text-align: center;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2328;
  padding-bottom: 14rpx;
  margin-bottom: 8rpx;
  border-bottom: 1rpx solid #f0f2f5;
}

.section-count {
  font-size: 22rpx;
  font-weight: 400;
}

.section-no {
  font-size: 22rpx;
  font-weight: 400;
}

.star {
  color: #cf1322;
  font-size: 24rpx;
}

.field {
  margin-top: 20rpx;
}

.label {
  font-size: 24rpx;
  color: #6b7280;
  margin-bottom: 10rpx;
}

.input,
.picker-box {
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 16rpx;
  box-sizing: border-box;
  font-size: 28rpx;
  background-color: #f7f8fa;
  border: 1rpx solid #e5e8eb;
  border-radius: 10rpx;
}

.picker-box--readonly {
  color: #4b5563;
  background-color: #f2f3f5;
}

.textarea {
  width: 100%;
  min-height: 120rpx;
  padding: 16rpx;
  box-sizing: border-box;
  font-size: 28rpx;
  line-height: 1.5;
  background-color: #f7f8fa;
  border: 1rpx solid #e5e8eb;
  border-radius: 10rpx;
}

.line-edit {
  margin-top: 22rpx;
  padding: 18rpx;
  background-color: #fafbfc;
  border: 1rpx solid #eff1f4;
  border-radius: 12rpx;
}

.line-edit__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.line-edit__no {
  font-size: 24rpx;
  color: #374151;
  font-weight: 600;
}

.line-edit__del {
  font-size: 24rpx;
  color: #cf1322;
  padding: 4rpx 8rpx;
}

.line-edit__row {
  display: flex;
}

.line-edit__col {
  flex: 1;
}

.line-edit__col:first-child {
  margin-right: 16rpx;
}

.line-add {
  margin-top: 20rpx;
  height: 72rpx;
  line-height: 72rpx;
  text-align: center;
  font-size: 27rpx;
  color: #1677ff;
  background-color: #f4f8ff;
  border: 1rpx dashed #bcd6ff;
  border-radius: 10rpx;
}

.sum {
  margin-top: 22rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid #f0f2f5;
}

.sum__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 0;
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

.sum__row--input .sum__input {
  width: 220rpx;
  height: 64rpx;
  line-height: 64rpx;
  text-align: right;
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
