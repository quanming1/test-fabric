import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { createEditor, Descendant, BaseEditor } from "slate";
import {
  Slate,
  Editable,
  withReact,
  RenderElementProps,
  RenderLeafProps,
  ReactEditor,
  useSlate,
  useSelected,
  useComposing,
} from "slate-react";
import { withHistory, HistoryEditor } from "slate-history";
import styles from "./index.module.scss";
import { useUpdate } from "ahooks";

// 定义自定义类型
type CustomText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

type ButtonElement = {
  type: "button";
  placeholder?: string;
  slotInfo?: {
    enum: string[];
    name: string;
    type: string;
    label: string;
    default: string;
    description: string;
    label_pre_upload: string;
    label_wo_example: string;
  };
  children: CustomText[];
};

type ParagraphElement = {
  type: "paragraph";
  children: (CustomText | ButtonElement)[];
};

type CustomElement = ParagraphElement | ButtonElement;

// 扩展 Slate 类型定义
declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

// 定义 Element 组件
const Element = (props: RenderElementProps) => {
  const { attributes, children, element } = props;

  switch (element.type) {
    case "button":
      return <EditableButtonComponent {...props} />;
    case "paragraph":
      return <p {...attributes}>{children}</p>;
    default:
      return <p {...attributes}>{children}</p>;
  }
};

// 定义 Text 组件（Leaf）
const Leaf = (props: RenderLeafProps) => {
  const { attributes, children, leaf } = props;

  let content = children;

  if (leaf.bold) {
    content = <strong>{content}</strong>;
  }

  if (leaf.italic) {
    content = <em>{content}</em>;
  }

  return <span {...attributes}>{content}</span>;
};

// 初始值 - 包含带有 slotInfo 的按钮元素
const initialValue: Descendant[] = [
  {
    type: "paragraph",
    children: [
      {
        text: "从",
      },
      {
        type: "button",
        children: [
          {
            text: "",
          },
        ],
        placeholder: "目标交易所：如上海证券交易所",
        slotInfo: {
          enum: [],
          name: "target_exchange",
          type: "text",
          label: "目标交易所：如上海证券交易所",
          default: "",
          description: "目标交易所名称",
          label_pre_upload: "请上传包含目标交易所信息的文本文件",
          label_wo_example: "目标交易所",
        },
      } as ButtonElement,
      {
        text: "下载",
      },
      {
        type: "button",
        children: [
          {
            text: "",
          },
        ],
        placeholder: "指定数量：如5",
        slotInfo: {
          enum: [],
          name: "document_count",
          type: "text",
          label: "指定数量：如5",
          default: "",
          description: "需要下载的招股书数量",
          label_pre_upload: "请上传包含指定数量信息的文本文件",
          label_wo_example: "指定数量",
        },
      } as ButtonElement,
      {
        text: "篇最新的招股书文件。",
      },
    ],
  },
];

export default function TestPage() {
  const fun = () => {};
  const update = useUpdate();
  const imeComposingRef = useRef(false);

  useEffect(() => {
    setInterval(() => {
      update();
    }, 500);
  }, []);

  console.log("123");

  return <CompWithMemo fun={fun} imeComposingRef={imeComposingRef} />;
}

interface CompProps {
  fun: () => any;
  imeComposingRef: React.MutableRefObject<boolean>;
}

// 配置编辑器以支持内联元素
const withInlines = (editor: ReactEditor) => {
  const { isInline } = editor;

  editor.isInline = (element) => {
    return element.type === "button" ? true : isInline(element);
  };

  return editor;
};

const Comp = ({ fun, imeComposingRef }: CompProps) => {
  // 创建编辑器实例（使用 useMemo 确保只创建一次）
  const editor = useMemo(() => withInlines(withHistory(withReact(createEditor()))), []);

  // 编辑器内容状态
  const [value, setValue] = useState<Descendant[]>(initialValue);

  // 处理内容变化
  const handleChange = useCallback((newValue: Descendant[]) => {
    setValue(newValue);
    console.log("编辑器内容变化:", newValue);
  }, []);

  // IME 事件处理
  const handleCompositionStart = useCallback(() => {
    imeComposingRef.current = true;
    console.log("IME 开始");
  }, [imeComposingRef]);

  const handleCompositionEnd = useCallback(() => {
    imeComposingRef.current = false;
    console.log("IME 结束");
  }, [imeComposingRef]);

  const handleBlur = useCallback(() => {
    // 兜底：某些场景下 compositionend 可能不触发（切换焦点/弹窗/重渲染）
    if (imeComposingRef.current) {
      imeComposingRef.current = false;
      console.log("IME 重置");
    }
  }, [imeComposingRef]);

  console.log("Comp 组件渲染");

  return (
    <div className={styles.container}>
      <h1>Slate.js 最简示例</h1>
      <div className={styles.editorWrapper}>
        <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
          <Editable
            renderElement={(props) => <Element {...props} />}
            renderLeaf={(props) => <Leaf {...props} />}
            placeholder="在这里输入内容..."
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onBlur={handleBlur}
            className={styles.editor}
          />
        </Slate>
      </div>
    </div>
  );
};

// 使用 React.memo 包装组件，在 IME 阶段阻止因函数变化导致的更新
const CompWithMemo = React.memo(Comp, (prevProps, nextProps) => {
  // 如果正在进行 IME 输入
  if (prevProps.imeComposingRef.current) {
    console.log("IME 阶段，阻止因 props 变化导致的更新");
    return true; // 返回 true 表示 props "相等"，阻止重新渲染
  }

  // 正常情况下比较 props（注意：函数每次都是新的，所以这里始终返回 false）
  return false;
});

// ============== 从 slot-input.tsx 简化提取的组件 ==============

// InlineChromiumBugfix: 修复 Chromium 内联元素的 bug
const InlineChromiumBugfix = ({ type = "space" }: { type?: "space" | "zero-width" }) => {
  const getContent = () => {
    switch (type) {
      case "space":
        return String.fromCodePoint(160); /* Non-breaking space */
      case "zero-width":
        return "\u200B"; /* Zero-width space */
      default:
        return String.fromCodePoint(160);
    }
  };

  return (
    <span contentEditable={false} style={{ fontSize: 0 }}>
      {getContent()}
    </span>
  );
};

const EditableButtonComponent = ({ attributes, children, element }: RenderElementProps) => {
  // 将 element 转换为 ButtonElement 类型
  const buttonElement = element as ButtonElement;
  // 获取当前输入的值 - 需要类型检查
  const firstChild = element?.children?.[0];
  const _value = firstChild && "text" in firstChild ? firstChild.text : "";
  const placeholderRef = React.useRef<HTMLSpanElement>(null);
  const [placeholderWidth, setPlaceholderWidth] = React.useState(0);
  const selected = useSelected();
  // 使用 Slate 的 useComposing hook 检测输入法合成状态
  const isComposing = useComposing();

  // 检测当前元素是否被选中且在输入法合成状态
  const isCurrentElementComposing = selected && isComposing;

  // 缓存 placeholder 值，避免在 IME 输入时频繁触发 useEffect
  const placeholder = React.useMemo(
    () => buttonElement.placeholder || "请输入...",
    [buttonElement.placeholder],
  );

  // 计算 placeholder 的宽度
  React.useEffect(() => {
    if (!_value && placeholderRef.current) {
      const width = placeholderRef.current.getBoundingClientRect().width;
      setPlaceholderWidth(width);
    }
  }, [_value, placeholder]);

  return (
    /*
      Note that this is not a true button, but a span with button-like CSS.
      True buttons are display:inline-block, but Chrome and Safari
      have a bad bug with display:inline-block inside contenteditable:
      - https://bugs.webkit.org/show_bug.cgi?id=105898
      - https://bugs.chromium.org/p/chromium/issues/detail?id=1088403
      Worse, one cannot override the display property: https://github.com/w3c/csswg-drafts/issues/3226
      The only current workaround is to emulate the appearance of a display:inline button using CSS.
    */
    <span {...attributes} onClick={(ev) => ev.preventDefault()} className={styles.editableButton}>
      <div className={styles.buttonContent}>
        {/* 隐藏的 placeholder 元素，用于测量宽度 */}
        <span ref={placeholderRef} className={styles.placeholderHidden} aria-hidden="true">
          [{placeholder}]
        </span>

        {/* 可见的 placeholder - 只在当前元素输入法合成时隐藏 */}
        {!_value && !isCurrentElementComposing && (
          <div contentEditable={false} className={styles.placeholderVisible}>
            <span>[{placeholder}]</span>
          </div>
        )}

        {/* 实际的输入区域 */}
        <div
          className={styles.inputArea}
          style={{
            minWidth: !_value && placeholderWidth ? `${placeholderWidth}px` : "auto",
          }}
        >
          <InlineChromiumBugfix />
          {children}
          <InlineChromiumBugfix />
        </div>
      </div>
    </span>
  );
};
