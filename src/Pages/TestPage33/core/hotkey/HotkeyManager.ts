import type { KeyCode, MouseButton } from "./types";

/** 输入码：键盘或鼠标 */
export type InputCode = KeyCode | MouseButton;

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
    /** 要监听的输入码 */
    codes: InputCode | InputCode[];
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
    /** 是否在捕获阶段监听事件，默认 false（冒泡阶段） */
    capture?: boolean;
}

const defaultConfig: Required<HotkeyManagerConfig> = {
    capture: true,
};

/**
 * 热键状态管理器
 * 职责：监听键盘和鼠标按键状态，供插件查询当前按下的热键
 */
export class HotkeyManager {
    private pressedKeys = new Set<string>();
    private pressedButtons = new Set<MouseButton>();
    private watchers: WatchEntry[] = [];
    private _destroyed = false;
    private config: Required<HotkeyManagerConfig>;

    constructor(
        private target: HTMLElement | Window = window,
        config: HotkeyManagerConfig = {}
    ) {
        this.config = { ...defaultConfig, ...config };
        this.bindEvents();
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
            // 如果是重复事件且 watcher 不响应重复，跳过
            if (isRepeat && !w.repeat) continue;
            const matched = this.isPressed(w.codes, w.mode);
            w.callback({ event, matched });
        }
    }

    // ========== 查询 API ==========

    /**
     * 判断指定的输入码是否按下（支持键盘和鼠标混合）
     * @param codes 单个或多个输入码
     * @param mode 匹配模式：'all'=全部按下(默认), 'any'=任意一个, 'only'=只按下这些
     */
    isPressed(codes: InputCode | InputCode[], mode: MatchMode = "all"): boolean {
        const arr = Array.isArray(codes) ? codes : [codes];
        if (arr.length === 0) return false;

        const keys = arr.filter((c): c is KeyCode => typeof c === "string");
        const buttons = arr.filter((c): c is MouseButton => typeof c === "number");

        if (mode === "only") {
            const totalPressed = this.pressedKeys.size + this.pressedButtons.size;
            if (totalPressed !== arr.length) return false;
        }

        const checkKey = (c: KeyCode) => this.pressedKeys.has(c);
        const checkButton = (b: MouseButton) => this.pressedButtons.has(b);

        if (mode === "any") {
            return keys.some(checkKey) || buttons.some(checkButton);
        }
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
     * @param config 配置项：codes, mode, repeat
     * @returns 取消监听的函数
     */
    watch(callback: WatchCallback, config: WatchConfig): () => void {
        const { codes, mode = "all", repeat = false } = config;
        const entry: WatchEntry = {
            codes: Array.isArray(codes) ? codes : [codes],
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
