import { useCallback, useEffect, useRef, useState } from 'react';
import { AutoComplete, Input } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { docApi } from '../api/doc';

interface Props {
  /** 补全来源：summary | partner | item | spec | color | handler */
  field: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 补全项被选中时回调（可用来带出规格/单位/价格） */
  onPick?: (value: string) => void;
  size?: 'large' | 'middle' | 'small';
  status?: 'error' | 'warning';
  style?: React.CSSProperties;
}

/**
 * 历史值自动补全输入框。
 * 输入时按关键字拉取历史值（按使用次数排序），选中即回填。
 */
export default function AutoCompleteInput({
  field,
  value,
  onChange,
  placeholder,
  disabled,
  onPick,
  size,
  status,
  style,
}: Props) {
  const [options, setOptions] = useState<AutoCompleteProps['options']>([]);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  const search = useCallback(
    (keyword: string) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(async () => {
        const my = ++seq.current;
        try {
          const list = await docApi.autocomplete(field, keyword);
          if (my !== seq.current) return;
          setOptions(
            (list || []).map(item => ({
              value: item.value,
              label: (
                <span>
                  {item.value}
                  <span style={{ float: 'right', color: '#bbb', fontSize: 12 }}>
                    {Number(item.cnt) > 1 ? `用过 ${item.cnt} 次` : ''}
                  </span>
                </span>
              ),
            }))
          );
        } catch {
          if (my === seq.current) setOptions([]);
        }
      }, 220);
    },
    [field]
  );

  // 聚焦先给一批历史值，避免用户面对空下拉
  const onFocus = () => {
    if (!options?.length) search(value || '');
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <AutoComplete
      value={value}
      options={options}
      style={style ?? { width: '100%' }}
      onSearch={search}
      onFocus={onFocus}
      onChange={v => {
        onChange?.(v ?? '');
        if (!v) search('');
      }}
      onSelect={v => {
        onChange?.(v);
        onPick?.(v);
      }}
      disabled={disabled}
      placeholder={placeholder}
    >
      <Input.Search size={size} status={status} />
    </AutoComplete>
  );
}
