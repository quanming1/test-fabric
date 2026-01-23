import type { KeyCode, MouseButton } from "./types";

/** 输入码：键盘或鼠标 */
export type InputCode = KeyCode | MouseButton;

/** 虚拟修饰键，自动适配 Mac/Windows */
export type VirtualModifier = "Mod" | "ModLeft" | "ModRight";

/** 扩展输入码：支持虚拟修饰键 */
export type ExtendedInputCode = InputCode | VirtualModifier;

/** 匹配模式 */
export type MatchMode = "all" | "any" | "only";

/** watch 回调参数 */
export interface WatchCallbackParams {
    event: KeyboardEvent | MouseEvent;
    matched: boolean;
}

/** watch 回调函数 */
export type WatchCallback = (params: WatchCallbackParams) => void;

/** watch 配置 */
export interface WatchConfig {
    /** 要监听的输入码（支持 Mod 虚拟键） */
    codes: ExtendedInputCode | ExtendedInputCode[];
    /** 匹配模式，默认 'all' */
    mode?: MatchMode;
    /** 是否响应长按重复事件，默认 false */
    repeat?: boolean;
}

interface WatchEntry {
    codes: InputCode[];
    mode: MatchMode;
    repeat: boolean;
    callback: WatchCallback;
}

/** HotkeyManager 配置 */
export interface HotkeyManagerConfig {
    /** 是否在捕获阶段监听事件，默认 true */
    capture?: boolean;
}

const defaultConfig: Required<HotkeyManagerConfig> = {
    capture: true,
};

/** 检测是否为 Mac 系统 */
const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/**
 * 热键状态管理器
 * 
 * 职责：监听键盘和鼠标按键状态，供插件查询当前按下的热键
 * 
 * 特性：
 * - 支持 Mod 虚拟键：Mac 上映射为 Meta(Command)，Windows 上映射为 Control
 * - 使用 Mod 可以一次性兼容两个平台的快捷键习惯
 */
export class HotkeyManager {
    private pressedKeys = new Set<string>();
    private pressedButtons = new Set<MouseButton>();
    private watchers: WatchEntry[] = [];
    private _destroyed = false;
    private config: Required<HotkeyManagerConfig>;

    /** 是否为 Mac 系统 */
    static readonly isMac = isMac;

    constructor(
        private target: HTMLElement | Window = window,
        config: HotkeyManagerConfig = {}
    ) {
        this.config = { ...defaultConfig, ...config };
        this.bindEvents();
    }

    /**
     * 将虚拟修饰键展开为实际的键码
     * Mod -> Mac: Meta, Windows: Control
     */
    private expandModifier(code: ExtendedInputCode): InputCode[] {
        switch (code) {
            case "Mod":
                return isMac ? ["MetaLeft", "MetaRight"] : ["ControlLeft", "ControlRight"];
            case "ModLeft":
                return isMac ? ["MetaLeft"] : ["ControlLeft"];
            case "ModRight":
                return isMac ? ["MetaRight"] : ["ControlRight"];
            default:
                return [code as InputCode];
        }
    }

    /**
     * 将输入码数组中的虚拟键展开
     * 对于 mode="only"，Mod 展开为单个键（左侧）
     * 对于其他模式，Mod 展开为两个键（左右都可）
     */
    private expandCodes(codes: ExtendedInputCode[], mode: MatchMode): InputCode[] {
        const result: InputCode[] = [];
        for (const code of codes) {
            if (code === "Mod" || code === "ModLeft" || code === "ModRight") {
                if (mode === "only") {
                    // only 模式下，Mod 只匹配左侧键
                    result.push(isMac ? "MetaLeft" : "ControlLeft");
                } else {
                    result.push(...this.expandModifier(code));
                }
            } else {
                result.push(code as InputCode);
            }
        }
        return result;
    }

    private bindEvents(): void {
        const t = this.target;
        const capture = this.config.capture;
        t.addEventListener("keydown", this.onKeyDown, capture);
        t.addEventListener("keyup", this.onKeyUp, capture);
        t.addEventListener("mousedown", this.onMouseDown, capture);
        t.addEventListener("mouseup", this.onMouseUp, capture);
        window.addEventListener("blur", this.onBlur);
    }

    private unbindEvents(): void {
        const t = this.target;
        const capture = this.config.capture;
        t.removeEventListener("keydown", this.onKeyDown, capture);
        t.removeEventListener("keyup", this.onKeyUp, capture);
        t.removeEventListener("mousedown", this.onMouseDown, capture);
        t.removeEventListener("mouseup", this.onMouseUp, capture);
        window.removeEventListener("blur", this.onBlur);
    }

    private onKeyDown = (e: Event): void => {
        const ke = e as KeyboardEvent;
        this.pressedKeys.add(ke.code);
        this.notifyWatchers(ke);
    };

    private onKeyUp = (e: Event): void => {
        const ke = e as KeyboardEvent;
        this.pressedKeys.delete(ke.code);
        this.notifyWatchers(ke);
    };

    private onMouseDown = (e: Event): void => {
        const me = e as MouseEvent;
        this.pressedButtons.add(me.button as MouseButton);
        this.notifyWatchers(me);
    };

    private onMouseUp = (e: Event): void => {
        const me = e as MouseEvent;
        this.pressedButtons.delete(me.button as MouseButton);
        this.notifyWatchers(me);
    };

    private onBlur = (): void => {
        this.pressedKeys.clear();
        this.pressedButtons.clear();
    };

    private notifyWatchers(event: KeyboardEvent | MouseEvent): void {
        const isRepeat = event instanceof KeyboardEvent && event.repeat;
        for (const w of this.watchers) {
            if (isRepeat && !w.repeat) continue;
            const matched = this.isPressed(w.codes, w.mode);
            w.callback({ event, matched });
        }
    }

    // ========== 查询 API ==========

    /**
     * 判断指定的输入码是否按下（支持键盘和鼠标混合）
     * @param codes 单个或多个输入码（支持 Mod 虚拟键）
     * @param mode 匹配模式：'all'=全部按下(默认), 'any'=任意一个, 'only'=只按下这些
     */
    isPressed(codes: ExtendedInputCode | ExtendedInputCode[], mode: MatchMode = "all"): boolean {
        const rawCodes = Array.isArray(codes) ? codes : [codes];
        if (rawCodes.length === 0) return false;

        // 展开虚拟键
        const expandedCodes = this.expandCodes(rawCodes, mode);

        const keys = expandedCodes.filter((c): c is KeyCode => typeof c === "string");
        const buttons = expandedCodes.filter((c): c is MouseButton => typeof c === "number");

        if (mode === "only") {
            const totalPressed = this.pressedKeys.size + this.pressedButtons.size;
            if (totalPressed !== expandedCodes.length) return false;
            return keys.every((c) => this.pressedKeys.has(c)) &&
                buttons.every((b) => this.pressedButtons.has(b));
        }

        const checkKey = (c: KeyCode) => this.pressedKeys.has(c);
        const checkButton = (b: MouseButton) => this.pressedButtons.has(b);

        if (mode === "any") {
            return keys.some(checkKey) || buttons.some(checkButton);
        }
        // mode === "all"
        return keys.every(checkKey) && buttons.every(checkButton);
    }

    /** 获取当前所有按下的键 */
    getPressedKeys(): KeyCode[] {
        return Array.from(this.pressedKeys) as KeyCode[];
    }

    /** 获取当前所有按下的鼠标按钮 */
    getPressedButtons(): MouseButton[] {
        return Array.from(this.pressedButtons);
    }

    // ========== Watch API ==========

    /**
     * 监听指定输入码，每次按键/鼠标事件都会触发回调
     * @param callback 回调函数
     * @param config 配置项：codes（支持 Mod 虚拟键）, mode, repeat
     * @returns 取消监听的函数
     */
    watch(callback: WatchCallback, config: WatchConfig): () => void {
        const { codes, mode = "all", repeat = false } = config;
        const rawCodes = Array.isArray(codes) ? codes : [codes];
        const expandedCodes = this.expandCodes(rawCodes, mode);

        const entry: WatchEntry = {
            codes: expandedCodes,
            mode,
            repeat,
            callback,
        };
        this.watchers.push(entry);
        return () => {
            const idx = this.watchers.indexOf(entry);
            if (idx !== -1) this.watchers.splice(idx, 1);
        };
    }

    // ========== 生命周期 ==========

    destroy(): void {
        if (this._destroyed) return;
        this._destroyed = true;
        this.unbindEvents();
        this.pressedKeys.clear();
        this.pressedButtons.clear();
        this.watchers.length = 0;
    }

    get isDestroyed(): boolean {
        return this._destroyed;
    }
}
