// 多端画布同步流程演示 - JavaScript

class SyncFlowDemo {
    constructor() {
        this.currentStep = 0;
        this.currentPhase = 'init';
        this.steps = this.defineSteps();
        this.state = this.initState();
        this.init();
    }

    initState() {
        return {
            clientA: { objects: [], history: [], connected: false },
            clientC: { objects: [], history: [], connected: false },
            server: { fullData: null, events: [], sseConnections: [] }
        };
    }

    init() {
        this.bindEvents();
        this.updateUI();
        document.getElementById('totalSteps').textContent = this.steps.length;
    }

    bindEvents() {
        document.getElementById('nextBtn').addEventListener('click', () => this.nextStep());
        document.getElementById('prevBtn').addEventListener('click', () => this.prevStep());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.querySelectorAll('.phase-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.jumpToPhase(e.target.dataset.phase));
        });
    }

    defineSteps() {
        return [
            // ========== 初始化阶段 ==========
            {
                phase: 'init',
                title: '初始化阶段开始',
                description: '用户打开画布页面，客户端需要完成一系列初始化操作，确保画布数据与服务端保持一致。',
                action: () => { },
                code: null
            },
            {
                phase: 'init',
                title: '步骤1: 生成客户端标识',
                description: '客户端A生成或从本地存储读取唯一标识 clientId。这个标识用于区分不同的浏览器标签页，确保同步事件能正确识别来源。',
                action: () => {
                    this.highlightElement('clientA');
                    this.updateStatus('statusA', '生成 clientId: a1b2c3d4', 'processing');
                },
                code: `<span class="code-comment">// 生成或获取客户端唯一标识</span>
<span class="code-keyword">const</span> clientId = localStorage.getItem(<span class="code-string">'clientId'</span>) 
    || crypto.randomUUID();
localStorage.setItem(<span class="code-string">'clientId'</span>, clientId);`
            },
            {
                phase: 'init',
                title: '步骤2: 请求初始化数据',
                description: '客户端A向服务端发送请求，获取画布的全量数据和增量事件列表。这是初始化的关键步骤。',
                action: () => {
                    this.showDataFlow('clientA', 'server', 'GET /full_data', 'request');
                },
                code: `<span class="code-comment">// 请求初始化数据</span>
<span class="code-keyword">const</span> response = <span class="code-keyword">await</span> fetch(<span class="code-string">'/api/canvas/sync/full_data'</span>);
<span class="code-keyword">const</span> { canvasJSON, events } = <span class="code-keyword">await</span> response.json();`
            },
            {
                phase: 'init',
                title: '步骤3: 服务端返回数据',
                description: '服务端返回画布全量数据（可能为null）和增量事件数组。事件按seq升序排列。',
                action: () => {
                    this.highlightElement('server');
                    this.showDataFlow('server', 'clientA', '{ canvasJSON, events }', 'response');
                    this.state.server.fullData = { version: '1.0', objects: [] };
                    this.updateServerUI();
                },
                code: `<span class="code-comment">// 服务端响应格式</span>
{
  <span class="code-string">"canvasJSON"</span>: { <span class="code-string">"version"</span>: <span class="code-string">"1.0"</span>, <span class="code-string">"objects"</span>: [] },
  <span class="code-string">"events"</span>: []
}`
            },
            {
                phase: 'init',
                title: '步骤4: 导入全量数据',
                description: '客户端A将全量JSON数据导入画布。这一步必须在应用增量事件之前完成，否则增量事件没有操作对象。',
                action: () => {
                    this.highlightElement('clientA');
                    this.updateStatus('statusA', '导入全量数据...', 'processing');
                },
                code: `<span class="code-comment">// 导入全量数据到画布</span>
<span class="code-keyword">if</span> (canvasJSON) {
    <span class="code-keyword">await</span> importExportPlugin.import(canvasJSON);
}`
            },
            {
                phase: 'init',
                title: '步骤5: 应用增量事件',
                description: '遍历事件数组，逐个通过 redo 逻辑应用到画布上。这样可以复用现有代码，保持逻辑一致性。',
                action: () => {
                    this.highlightElement('clientA');
                    this.updateStatus('statusA', '应用增量事件...', 'processing');
                },
                code: `<span class="code-comment">// 依次应用增量事件</span>
<span class="code-keyword">for</span> (<span class="code-keyword">const</span> event <span class="code-keyword">of</span> events) {
    <span class="code-keyword">await</span> syncManager.applySnapshot(event.data.snapshot);
}`
            },
            {
                phase: 'init',
                title: '步骤6: 建立SSE连接',
                description: '客户端A建立SSE连接，开始监听服务端广播的同步事件。连接时需要带上clientId参数。',
                action: () => {
                    this.showDataFlow('clientA', 'server', 'SSE Connect', 'request');
                    this.state.clientA.connected = true;
                    this.state.server.sseConnections.push({ id: 'a1b2c3d4', name: '客户端A' });
                    this.updateServerUI();
                    this.updateStatus('statusA', 'SSE 已连接 ✓', 'success');
                },
                code: `<span class="code-comment">// 建立SSE连接</span>
<span class="code-keyword">const</span> sse = <span class="code-keyword">new</span> EventSource(
    <span class="code-string">\`/api/canvas/sync/sse?clientId=\${clientId}\`</span>
);
sse.onmessage = (e) => handleSyncEvent(JSON.parse(e.data));`
            },
            {
                phase: 'init',
                title: '客户端A初始化完成',
                description: '客户端A已完成所有初始化步骤，现在可以正常使用画布并接收同步事件了。',
                action: () => {
                    this.clearHighlights();
                    this.updateStatus('statusA', '初始化完成 ✓', 'success');
                },
                code: null
            },
            // ========== 操作同步阶段 ==========
            {
                phase: 'sync',
                title: '操作同步阶段开始',
                description: '现在客户端C也打开了同一个画布。我们来看看当客户端A进行操作时，如何同步到客户端C。',
                action: () => {
                    this.state.clientC.connected = true;
                    this.state.server.sseConnections.push({ id: 'x9y8z7w6', name: '客户端C' });
                    this.updateServerUI();
                    this.updateStatus('statusC', 'SSE 已连接 ✓', 'success');
                },
                code: null
            },
            {
                phase: 'sync',
                title: '步骤1: 用户在客户端A添加图片',
                description: '用户在客户端A上传了一张图片。系统先将图片上传到服务器获取URL，然后在画布上创建图片对象。',
                action: () => {
                    this.highlightElement('clientA');
                    this.addCanvasObject('A', 'img1', '🖼️');
                    this.updateStatus('statusA', '添加图片...', 'processing');
                },
                code: `<span class="code-comment">// 上传图片获取URL</span>
<span class="code-keyword">const</span> formData = <span class="code-keyword">new</span> FormData();
formData.append(<span class="code-string">'file'</span>, file);
<span class="code-keyword">const</span> { url } = <span class="code-keyword">await</span> fetch(<span class="code-string">'/api/upload/image'</span>, {
    method: <span class="code-string">'POST'</span>, body: formData
}).then(r => r.json());`
            },
            {
                phase: 'sync',
                title: '步骤2: 生成历史记录',
                description: '操作完成后，HistoryManager 生成一条历史记录。记录中 needSync=true 表示需要同步到其他端。',
                action: () => {
                    this.addHistoryItem('A', { type: 'add', id: 'img1', needSync: true });
                },
                code: `<span class="code-comment">// 历史记录格式</span>
{
  <span class="code-string">"id"</span>: <span class="code-string">"record_001"</span>,
  <span class="code-string">"type"</span>: <span class="code-string">"add"</span>,
  <span class="code-string">"pluginName"</span>: <span class="code-string">"image"</span>,
  <span class="code-string">"objectIds"</span>: [<span class="code-string">"img1"</span>],
  <span class="code-string">"after"</span>: [{ <span class="code-string">"id"</span>: <span class="code-string">"img1"</span>, <span class="code-string">"data"</span>: {...} }],
  <span class="code-string">"needSync"</span>: <span class="code-keyword">true</span>
}`
            },
            {
                phase: 'sync',
                title: '步骤3: 推送同步事件',
                description: '由于 needSync=true，系统调用接口将操作快照推送到服务端。',
                action: () => {
                    this.showDataFlow('clientA', 'server', 'POST /event', 'request');
                },
                code: `<span class="code-comment">// 推送同步事件</span>
<span class="code-keyword">await</span> fetch(<span class="code-string">'/api/canvas/sync/event'</span>, {
    method: <span class="code-string">'POST'</span>,
    body: JSON.stringify({
        eventType: <span class="code-string">'client:change'</span>,
        data: { clientId, snapshot: record }
    })
});`
            },
            {
                phase: 'sync',
                title: '步骤4: 服务端处理事件',
                description: '服务端收到事件后，分配全局序号seq，存入事件队列，然后返回seq和队列长度。',
                action: () => {
                    this.highlightElement('server');
                    this.state.server.events.push({ seq: 1, type: 'add', clientId: 'a1b2c3d4' });
                    this.updateServerUI();
                    this.showDataFlow('server', 'clientA', '{ seq: 1, len: 1 }', 'response');
                },
                code: `<span class="code-comment">// 服务端响应</span>
{
  <span class="code-string">"seq"</span>: <span class="code-number">1</span>,
  <span class="code-string">"eventArrayLength"</span>: <span class="code-number">1</span>
}`
            },
            {
                phase: 'sync',
                title: '步骤5: 服务端广播事件',
                description: '服务端通过SSE将事件广播给所有已连接的客户端，包括客户端A和客户端C。',
                action: () => {
                    this.showDataFlow('server', 'clientA', 'SSE: sync_event', 'sse');
                    setTimeout(() => {
                        this.showDataFlow('server', 'clientC', 'SSE: sync_event', 'sse');
                    }, 300);
                },
                code: `<span class="code-comment">// SSE广播数据格式</span>
{
  <span class="code-string">"type"</span>: <span class="code-string">"sync_event"</span>,
  <span class="code-string">"data"</span>: {
    <span class="code-string">"seq"</span>: <span class="code-number">1</span>,
    <span class="code-string">"eventType"</span>: <span class="code-string">"client:change"</span>,
    <span class="code-string">"data"</span>: { <span class="code-string">"clientId"</span>: <span class="code-string">"a1b2c3d4"</span>, <span class="code-string">"snapshot"</span>: {...} }
  }
}`
            },
            {
                phase: 'sync',
                title: '步骤6: 客户端A忽略自己的事件',
                description: '客户端A收到事件后，比对clientId发现是自己发起的操作，直接忽略，不做任何处理。',
                action: () => {
                    this.highlightElement('clientA');
                    this.updateStatus('statusA', '忽略自己的事件', 'success');
                },
                code: `<span class="code-comment">// 判断是否是自己发起的</span>
<span class="code-keyword">if</span> (event.data.clientId === myClientId) {
    <span class="code-keyword">return</span>; <span class="code-comment">// 忽略</span>
}`
            },
            {
                phase: 'sync',
                title: '步骤7: 客户端C应用快照',
                description: '客户端C收到事件后，发现clientId不同，说明是其他端的操作。通过redo逻辑应用快照到画布。',
                action: () => {
                    this.highlightElement('clientC');
                    this.addCanvasObject('C', 'img1', '🖼️');
                    this.updateStatus('statusC', '应用远程快照...', 'processing');
                },
                code: `<span class="code-comment">// 应用远程快照</span>
<span class="code-keyword">if</span> (event.data.clientId !== myClientId) {
    <span class="code-keyword">await</span> applySnapshot(event.data.snapshot);
}`
            },
            {
                phase: 'sync',
                title: '步骤8: 客户端C清空历史栈',
                description: '应用完快照后，客户端C清空本地历史记录栈。因为收到远程操作后，本地历史已"过时"。',
                action: () => {
                    this.clearHistory('C');
                    this.updateStatus('statusC', '同步完成 ✓', 'success');
                    this.clearHighlights();
                },
                code: `<span class="code-comment">// 清空本地历史栈</span>
historyManager.clearHistory();`
            },
            // ========== 撤销重做阶段 ==========
            {
                phase: 'undo',
                title: '撤销重做同步阶段',
                description: '当用户执行撤销或重做操作时，产生的状态变化同样需要同步到其他客户端。',
                action: () => { },
                code: null
            },
            {
                phase: 'undo',
                title: '步骤1: 用户在客户端A移动图片',
                description: '用户在客户端A上将图片向右移动了200px，系统记录这次操作。',
                action: () => {
                    this.highlightElement('clientA');
                    this.addHistoryItem('A', { type: 'modify', id: 'img1', desc: '移动+200px' });
                    this.updateStatus('statusA', '移动图片...', 'processing');
                    // 同步到C
                    this.state.server.events.push({ seq: 2, type: 'modify', clientId: 'a1b2c3d4' });
                    this.updateServerUI();
                },
                code: `<span class="code-comment">// 移动操作的历史记录</span>
{
  <span class="code-string">"type"</span>: <span class="code-string">"modify"</span>,
  <span class="code-string">"before"</span>: [{ <span class="code-string">"left"</span>: <span class="code-number">100</span> }],
  <span class="code-string">"after"</span>: [{ <span class="code-string">"left"</span>: <span class="code-number">300</span> }]
}`
            },
            {
                phase: 'undo',
                title: '步骤2: 用户按下 Ctrl+Z 撤销',
                description: '用户在客户端A按下Ctrl+Z，图片回到原位。撤销操作在本地执行完成。',
                action: () => {
                    this.highlightElement('clientA');
                    this.removeHistoryItem('A');
                    this.updateStatus('statusA', '执行撤销...', 'processing');
                },
                code: `<span class="code-comment">// 执行本地撤销</span>
<span class="code-keyword">await</span> historyManager.performUndo();`
            },
            {
                phase: 'undo',
                title: '步骤3: 构造反向操作的同步事件',
                description: '撤销操作需要同步！系统构造一个"反向操作"的快照：原来是向右移动，现在变成向左移动。',
                action: () => {
                    this.highlightElement('clientA');
                },
                code: `<span class="code-comment">// 撤销产生的同步事件（before和after互换）</span>
{
  <span class="code-string">"type"</span>: <span class="code-string">"modify"</span>,
  <span class="code-string">"before"</span>: [{ <span class="code-string">"left"</span>: <span class="code-number">300</span> }], <span class="code-comment">// 原after</span>
  <span class="code-string">"after"</span>: [{ <span class="code-string">"left"</span>: <span class="code-number">100</span> }]   <span class="code-comment">// 原before</span>
}`
            },
            {
                phase: 'undo',
                title: '步骤4: 推送撤销事件到服务端',
                description: '将构造好的反向操作快照推送到服务端。注意：这里推送的是 modify 类型，只是 before/after 互换了，不存在 undo 类型！',
                action: () => {
                    this.showDataFlow('clientA', 'server', 'POST /event', 'request');
                    this.state.server.events.push({ seq: 3, type: 'modify', clientId: 'a1b2c3d4' });
                    this.updateServerUI();
                },
                code: `<span class="code-comment">// 推送撤销产生的同步事件（类型仍是 modify）</span>
<span class="code-keyword">await</span> syncManager.pushEvent({
    eventType: <span class="code-string">'client:change'</span>,
    data: { clientId, snapshot: reversedRecord }
});
<span class="code-comment">// reversedRecord.type 仍然是 "modify"</span>
<span class="code-comment">// 只是 before 和 after 互换了</span>`
            },
            {
                phase: 'undo',
                title: '步骤5: 客户端C收到并应用',
                description: '客户端C收到事件后，通过redo逻辑应用快照。对C来说，这就是一次普通的 modify 操作，它不知道这是撤销产生的。',
                action: () => {
                    this.showDataFlow('server', 'clientC', 'SSE: modify event', 'sse');
                    this.highlightElement('clientC');
                    this.updateStatus('statusC', '应用快照...', 'processing');
                },
                code: `<span class="code-comment">// 客户端C的处理逻辑完全相同</span>
<span class="code-keyword">if</span> (event.data.clientId !== myClientId) {
    <span class="code-keyword">await</span> applySnapshot(event.data.snapshot);
    historyManager.clearHistory();
}`
            },
            {
                phase: 'undo',
                title: '撤销同步完成',
                description: '现在两个客户端的画布状态保持一致：图片都回到了原来的位置。撤销操作成功同步！',
                action: () => {
                    this.clearHighlights();
                    this.updateStatus('statusA', '撤销完成 ✓', 'success');
                    this.updateStatus('statusC', '同步完成 ✓', 'success');
                },
                code: null
            },
            // ========== 全量同步阶段 ==========
            {
                phase: 'full',
                title: '全量同步阶段',
                description: '随着操作增多，事件队列会越来越长。当超过阈值时，需要进行全量同步来优化性能。',
                action: () => {
                    // 模拟添加更多事件
                    for (let i = 4; i <= 12; i++) {
                        this.state.server.events.push({ seq: i, type: 'op', clientId: 'a1b2c3d4' });
                    }
                    this.updateServerUI();
                },
                code: null
            },
            {
                phase: 'full',
                title: '步骤1: 检测队列长度超过阈值',
                description: '客户端A推送事件后，服务端返回队列长度为12，超过了阈值10，触发全量同步。',
                action: () => {
                    this.highlightElement('clientA');
                    this.updateStatus('statusA', '队列长度: 12 > 10', 'processing');
                },
                code: `<span class="code-comment">// 检查是否需要全量同步</span>
<span class="code-keyword">const</span> { eventArrayLength } = <span class="code-keyword">await</span> pushEvent(event);
<span class="code-keyword">if</span> (eventArrayLength > FULL_SYNC_THRESHOLD) {
    <span class="code-keyword">await</span> triggerFullSync();
}`
            },
            {
                phase: 'full',
                title: '步骤2: 导出画布完整数据',
                description: '客户端A调用 ImportExportPlugin 的导出功能，将当前画布的完整状态导出为JSON。',
                action: () => {
                    this.highlightElement('clientA');
                    this.updateStatus('statusA', '导出画布数据...', 'processing');
                },
                code: `<span class="code-comment">// 导出画布完整数据</span>
<span class="code-keyword">const</span> canvasJSON = <span class="code-keyword">await</span> importExportPlugin.export();
<span class="code-comment">// { version: "1.0", objects: [...], plugins: {...} }</span>`
            },
            {
                phase: 'full',
                title: '步骤3: 上传全量数据到服务端',
                description: '将导出的JSON数据上传到服务端，服务端会存储这份数据并清空事件队列。',
                action: () => {
                    this.showDataFlow('clientA', 'server', 'POST /full', 'request');
                },
                code: `<span class="code-comment">// 上传全量数据</span>
<span class="code-keyword">await</span> fetch(<span class="code-string">'/api/canvas/sync/full'</span>, {
    method: <span class="code-string">'POST'</span>,
    body: JSON.stringify({ clientId, canvasJSON })
});`
            },
            {
                phase: 'full',
                title: '步骤4: 服务端处理全量同步',
                description: '服务端存储新的全量数据，同时清空事件队列。下次新客户端初始化时，直接使用这份最新数据。',
                action: () => {
                    this.highlightElement('server');
                    this.state.server.fullData = { version: '1.0', objects: ['img1'], updated: true };
                    this.state.server.events = [];
                    this.updateServerUI();
                    this.showDataFlow('server', 'clientA', '{ success: true }', 'response');
                },
                code: `<span class="code-comment">// 服务端处理</span>
<span class="code-comment">// 1. 存储 canvasJSON</span>
<span class="code-comment">// 2. 清空事件队列</span>
<span class="code-comment">// 3. 返回成功</span>`
            },
            {
                phase: 'full',
                title: '全量同步完成',
                description: '全量同步完成！事件队列已清空，服务端保存了最新的画布状态。系统性能得到优化。',
                action: () => {
                    this.clearHighlights();
                    this.updateStatus('statusA', '全量同步完成 ✓', 'success');
                },
                code: null
            },
            {
                phase: 'full',
                title: '🎉 演示完成',
                description: '恭喜！你已经了解了多端画布同步的完整流程，包括：初始化、操作同步、撤销重做同步、全量同步四个阶段。',
                action: () => {
                    this.clearHighlights();
                },
                code: null
            }
        ];
    }

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.executeStep();
        }
    }

    prevStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.state = this.initState();
            // 重新执行到当前步骤
            for (let i = 0; i <= this.currentStep; i++) {
                const step = this.steps[i];
                step.action.call(this);
            }
            this.updateUI();
        }
    }

    reset() {
        this.currentStep = 0;
        this.state = this.initState();
        this.updateUI();
        this.clearAllUI();
    }

    jumpToPhase(phase) {
        const phaseIndex = this.steps.findIndex(s => s.phase === phase);
        if (phaseIndex !== -1) {
            this.currentStep = phaseIndex;
            this.state = this.initState();
            for (let i = 0; i <= this.currentStep; i++) {
                this.steps[i].action.call(this);
            }
            this.updateUI();
        }
    }

    executeStep() {
        const step = this.steps[this.currentStep];
        step.action.call(this);
        this.updateUI();
    }

    updateUI() {
        const step = this.steps[this.currentStep];

        // 更新步骤指示器
        document.getElementById('currentStep').textContent = this.currentStep + 1;

        // 更新按钮状态
        document.getElementById('prevBtn').disabled = this.currentStep === 0;
        document.getElementById('nextBtn').disabled = this.currentStep === this.steps.length - 1;

        // 更新阶段标签
        document.querySelectorAll('.phase-tab').forEach(tab => {
            tab.classList.remove('active');
            const tabPhase = tab.dataset.phase;
            const phaseSteps = this.steps.filter(s => s.phase === tabPhase);
            const phaseStart = this.steps.indexOf(phaseSteps[0]);
            const phaseEnd = this.steps.indexOf(phaseSteps[phaseSteps.length - 1]);

            if (this.currentStep >= phaseStart && this.currentStep <= phaseEnd) {
                tab.classList.add('active');
            }
            if (this.currentStep > phaseEnd) {
                tab.classList.add('completed');
            } else {
                tab.classList.remove('completed');
            }
        });

        // 更新描述面板
        document.getElementById('stepTitle').textContent = step.title;
        document.getElementById('stepDescription').textContent = step.description;

        // 更新代码预览
        const codePreview = document.getElementById('codePreview');
        if (step.code) {
            codePreview.innerHTML = `<pre>${step.code}</pre>`;
            codePreview.classList.add('visible');
        } else {
            codePreview.classList.remove('visible');
        }
    }

    // UI 操作方法
    highlightElement(id) {
        this.clearHighlights();
        const el = document.getElementById(id);
        if (el) el.classList.add('highlight');
    }

    clearHighlights() {
        document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    }

    updateStatus(id, text, type) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = text;
            el.className = 'client-status ' + (type || '');
        }
    }

    addCanvasObject(client, id, icon) {
        const container = document.getElementById('objects' + client);
        if (container && !container.querySelector(`[data-id="${id}"]`)) {
            const obj = document.createElement('div');
            obj.className = 'canvas-object';
            obj.dataset.id = id;
            obj.textContent = icon;
            container.appendChild(obj);
            this.state['client' + client].objects.push(id);
        }
    }

    removeCanvasObject(client, id) {
        const container = document.getElementById('objects' + client);
        const obj = container?.querySelector(`[data-id="${id}"]`);
        if (obj) {
            obj.classList.add('removing');
            setTimeout(() => obj.remove(), 500);
        }
    }

    addHistoryItem(client, record) {
        const container = document.getElementById('historyItems' + client);
        if (container) {
            const item = document.createElement('div');
            item.className = 'stack-item';
            item.textContent = `${record.type}: ${record.id}`;
            container.appendChild(item);
            this.state['client' + client].history.push(record);
        }
    }

    removeHistoryItem(client) {
        const container = document.getElementById('historyItems' + client);
        const items = container?.querySelectorAll('.stack-item');
        if (items && items.length > 0) {
            const last = items[items.length - 1];
            last.classList.add('clearing');
            setTimeout(() => last.remove(), 300);
            this.state['client' + client].history.pop();
        }
    }

    clearHistory(client) {
        const container = document.getElementById('historyItems' + client);
        if (container) {
            container.querySelectorAll('.stack-item').forEach(item => {
                item.classList.add('clearing');
                setTimeout(() => item.remove(), 300);
            });
            this.state['client' + client].history = [];
        }
    }

    showDataFlow(from, to, label, type) {
        const fromEl = document.getElementById(from);
        const toEl = document.getElementById(to);
        const container = document.getElementById('dataFlow');

        if (!fromEl || !toEl || !container) return;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const containerRect = container.parentElement.getBoundingClientRect();

        const packet = document.createElement('div');
        packet.className = `flow-packet ${type}`;
        packet.textContent = label;

        const startX = fromRect.left + fromRect.width / 2 - containerRect.left;
        const startY = fromRect.top + fromRect.height / 2 - containerRect.top;
        const endX = toRect.left + toRect.width / 2 - containerRect.left;
        const endY = toRect.top + toRect.height / 2 - containerRect.top;

        packet.style.left = startX + 'px';
        packet.style.top = startY + 'px';
        packet.style.transform = 'translate(-50%, -50%)';

        container.appendChild(packet);

        // 动画移动
        requestAnimationFrame(() => {
            packet.style.transition = 'all 0.8s ease-in-out';
            packet.style.left = endX + 'px';
            packet.style.top = endY + 'px';
        });

        // 移除
        setTimeout(() => {
            packet.style.opacity = '0';
            setTimeout(() => packet.remove(), 300);
        }, 1000);
    }

    updateServerUI() {
        // 更新全量数据显示
        const fullDataEl = document.getElementById('fullData');
        if (this.state.server.fullData) {
            fullDataEl.textContent = JSON.stringify(this.state.server.fullData).substring(0, 50) + '...';
            fullDataEl.classList.add('has-data');
        } else {
            fullDataEl.textContent = 'null';
            fullDataEl.classList.remove('has-data');
        }

        // 更新事件队列
        const queueEl = document.getElementById('eventQueue');
        queueEl.innerHTML = '';
        this.state.server.events.slice(-5).forEach(event => {
            const item = document.createElement('div');
            item.className = 'queue-item';
            item.textContent = `seq:${event.seq} ${event.type} from:${event.clientId.substring(0, 4)}`;
            queueEl.appendChild(item);
        });
        document.getElementById('queueLength').textContent = this.state.server.events.length;

        // 更新SSE连接
        const sseEl = document.getElementById('sseList');
        sseEl.innerHTML = '';
        this.state.server.sseConnections.forEach(conn => {
            const item = document.createElement('div');
            item.className = 'sse-item';
            item.innerHTML = `<span class="sse-dot"></span><span>${conn.name}</span>`;
            sseEl.appendChild(item);
        });
    }

    clearAllUI() {
        document.getElementById('objectsA').innerHTML = '';
        document.getElementById('objectsC').innerHTML = '';
        document.getElementById('historyItemsA').innerHTML = '';
        document.getElementById('historyItemsC').innerHTML = '';
        document.getElementById('eventQueue').innerHTML = '';
        document.getElementById('sseList').innerHTML = '';
        document.getElementById('fullData').textContent = 'null';
        document.getElementById('fullData').classList.remove('has-data');
        document.getElementById('queueLength').textContent = '0';
        this.updateStatus('statusA', '等待初始化...', '');
        this.updateStatus('statusC', '等待初始化...', '');
        this.clearHighlights();
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new SyncFlowDemo();
});
