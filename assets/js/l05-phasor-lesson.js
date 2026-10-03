(function () {
  "use strict";
  const root = document.querySelector('[data-l05]');
  if (!root || !window.L05PhasorModel) return;
  const model = window.L05PhasorModel, zh = root.dataset.lang === 'zh';
  const find = selector => root.querySelector(selector);
  const all = selector => [...root.querySelectorAll(selector)];
  const words = (cn, en) => zh ? cn : en;
  const fmt = (x, digits = 3) => (Math.abs(x) < 0.5 * 10 ** -digits ? 0 : x).toFixed(digits);
  const angle = x => x === null ? words('未定义（零向量）', 'Undefined (zero vector)') : fmt(x) + '°';
  const rectangular = z => `${fmt(z.re)} ${z.im < 0 ? '−' : '+'} j${fmt(Math.abs(z.im))} V`;
  const colors = {vs:'#67359b', vx:'#bb5b0b', total:'#087e75', current:'#306bb2', reference:'#6b7280', code:'#225bba'};
  let state = {...model.defaults}, solution = model.solve(state), runner;

  all('[data-math]').forEach(element => {
    if (window.katex) window.katex.render(element.dataset.math, element, {throwOnError:false, displayMode:true});
  });

  function phasorChart(svg, r) {
    const bound = Math.max(50, Math.ceil(Math.max(r.vs.rms, r.vx.rms, r.total.rms) / 50) * 50);
    const scale = 120 / bound, x = a => 245 + a * scale, y = b => 168 - b * scale;
    const path = (from, to, color, marker, dash = '') => `<path d="M${x(from.re)} ${y(from.im)} L${x(to.re)} ${y(to.im)}" fill="none" stroke="${color}" stroke-width="3" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#l05-${marker})"/>`;
    const origin = {re:0,im:0};
    svg.setAttribute('viewBox', '0 0 500 340');
    svg.innerHTML = `<title>${words('RMS 电压相量，单位 V', 'RMS voltage phasors in V')}</title><defs>${['vs','vx','total'].map(key => `<marker id="l05-${key}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="${colors[key]}"/></marker>`).join('')}</defs>
      <path d="M35 168H465 M245 25V305" class="l05-axis"/>
      <g class="l05-svg-label"><text x="461" y="190" text-anchor="end">Re / V</text><text x="253" y="22">Im / V</text><text x="234" y="185" text-anchor="end">0</text>${[-bound,bound].map(v => `<path d="M${x(v)} 164v8 M241 ${y(v)}h8" class="l05-axis"/><text x="${x(v)}" y="190" text-anchor="middle">${v}</text><text x="232" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}</g>
      <path d="M${x(r.total.re)} 168V${y(r.total.im)}H245" class="l05-component"/>
      ${path(origin,r.vx,colors.vx,'vx','4 5')}${path(origin,r.vs,colors.vs,'vs')}${path(r.vs,r.total,colors.vx,'vx')}${path(origin,r.total,colors.total,'total')}
      <g class="l05-vector-label"><text fill="${colors.vs}" x="${x(r.vs.re)-10}" y="${y(r.vs.im)-14}" text-anchor="end">Vₛ</text><text fill="${colors.vx}" x="${x((r.vs.re+r.total.re)/2)+13}" y="${y((r.vs.im+r.total.im)/2)-8}">Vₓ</text><text fill="${colors.total}" x="${x(r.total.re)+10}" y="${y(r.total.im)+21}">Vₜ</text></g>
      <text x="250" y="331" text-anchor="middle" class="l05-svg-label">${r.total.rms === 0 ? words('Vₜ = 0：相角未定义', 'Vₜ = 0: angle undefined') : `Vₜ = ${fmt(r.total.rms)} ∠ ${fmt(r.total.angle_deg)}° V`}</text>`;
  }

  // Each series carries its own time grid, so edited Python frequency is visible.
  function waveChart(svg, series, {normalized = false, cursor = null} = {}) {
    const right = 480, left = 56, top = 30, bottom = 250;
    const timeMax = Math.max(...series.map(s => s.t[s.t.length-1]), 0.001);
    let amplitude = 0;
    series.forEach(s => s.values.forEach(v => { amplitude = Math.max(amplitude, Math.abs(v)); }));
    const bound = normalized ? 1.2 : Math.max(50, Math.ceil(amplitude * 1.08 / 50) * 50);
    const x = t => left + t / timeMax * (right-left), y = v => (top+bottom)/2 - v / bound * (bottom-top)/2;
    const grid = [-1,-0.5,0,0.5,1].map(a => `<path d="M${left} ${y(a*bound)}H${right}" class="l05-grid"/><text x="${left-9}" y="${y(a*bound)+4}" text-anchor="end">${normalized ? fmt(a*bound,1) : fmt(a*bound,0)}</text>`).join('');
    const ticks = [0,0.25,0.5,0.75,1].map(a => `<path d="M${x(a*timeMax)} ${bottom}v5" class="l05-axis"/><text x="${x(a*timeMax)}" y="${bottom+23}" text-anchor="middle">${fmt(a*timeMax,1)}</text>`).join('');
    const lines = series.map(s => `<path d="${s.values.map((v,i) => `${i?'L':'M'}${x(s.t[i]).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width||2.4}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`).join('');
    svg.setAttribute('viewBox','0 0 500 300');
    svg.innerHTML = `<title>${words('时间波形', 'Time waveforms')}</title><g class="l05-svg-label">${grid}${ticks}<text x="${left}" y="17">${normalized ? words('各自峰值归一化', 'Normalized by own peak') : 'v / V'}</text><text x="${right}" y="295" text-anchor="end">t / ms</text></g><path d="M${left} ${top}V${bottom}H${right}" class="l05-axis"/>${lines}${cursor === null ? '' : `<path d="M${x(cursor)} ${top}V${bottom}" class="l05-time-cursor"/>`}`;
  }

  function drawWaves() {
    const wave = solution.waveform;
    const time = solution.period_ms * Number(find('[data-cursor]').value) / 100;
    waveChart(find('[data-waveform]'), ['vs','vx','total'].map(key => ({t:wave.t_ms,values:wave[key+'_v'],color:colors[key],width:key==='total'?3:2})), {cursor:time});
    waveChart(find('[data-phase-wave]'), [
      {t:wave.t_ms,values:wave.v_normalized,color:colors.vs},
      {t:wave.t_ms,values:wave.i_normalized,color:colors.current,dash:'7 4'}
    ], {normalized:true,cursor:time});
    find('[data-cursor-output]').textContent = fmt(time) + ' ms';
    const t = time/1000;
    const a = Math.SQRT2*state.vs_rms*Math.cos(state.omega*t+state.vs_angle_deg*Math.PI/180);
    const b = Math.SQRT2*state.vx_rms*Math.cos(state.omega*t+state.vx_angle_deg*Math.PI/180);
    find('[data-cursor-readout]').textContent = `t = ${fmt(time)} ms · vₛ = ${fmt(a)} V · vₓ = ${fmt(b)} V · vₜ = ${fmt(a+b)} V`;
  }

  function render() {
    solution = model.solve(state);
    all('[data-param]').forEach(input => { input.value = state[input.dataset.param]; });
    all('[data-value]').forEach(output => {
      const key = output.dataset.value;
      output.textContent = state[key] + (key.endsWith('_rms') ? ' V' : key.includes('angle') ? '°' : '');
    });
    find('[data-result="rms"]').textContent = fmt(solution.total.rms) + ' V';
    find('[data-result="angle"]').textContent = angle(solution.total.angle_deg);
    find('[data-result="peak"]').textContent = fmt(solution.total.peak) + ' V';
    find('[data-result="frequency"]').textContent = `${fmt(solution.frequency_hz)} Hz / ${fmt(solution.period_ms)} ms`;
    find('[data-lab-status]').textContent = solution.total.rms === 0 ? words('两电压抵消；零向量没有相角。', 'The voltages cancel; the zero vector has no angle.') : words('当前输入已计算；相量和波形使用同一组参数。', 'Calculated: phasors and waveforms share the same inputs.');
    phasorChart(find('[data-phasor]'),solution);
    drawWaves();
    find('[data-equations]').textContent = `Vₛ = ${rectangular(solution.vs)}\nVₓ = ${rectangular(solution.vx)}\nVₜ = ${rectangular(solution.total)}\n` +
      (solution.total.rms === 0 ? 'vₜ(t) = 0 V\n' : `Vₜ = ${fmt(solution.total.rms)} ∠ ${fmt(solution.total.angle_deg)}° V (RMS)\nvₜ(t) = ${fmt(solution.total.peak)} cos(${state.omega}t ${solution.total.angle_deg<0?'−':'+'} ${fmt(Math.abs(solution.total.angle_deg))}°) V\n`) +
      words('整周期数值 RMS', 'Whole-period numerical RMS') + ` = ${fmt(solution.numerical_rms)} V\n` +
      words('直接叠加与重建的最大差值', 'Max difference: direct sum vs reconstruction') + ` = ${solution.reconstruction_error_max.toExponential(2)} V`;
    const delta = solution.phase_difference_deg;
    const phaseText = delta === null ? words('Vₛ 幅值为零，相位及其与电流的超前/滞后关系未定义。', 'Vₛ is zero; its phase and lead/lag relative to current are undefined.') :
      Math.abs(delta) === 180 ? words('Vₛ 与 I 反相（180°），不指定唯一的超前/滞后方向。', 'Vₛ and I oppose (180°); there is no unique lead/lag direction.') :
      Math.abs(delta) < 1e-10 ? words('Vₛ 与 I 同相。', 'Vₛ and I are in phase.') :
      words(`Vₛ ${delta>0?'超前':'滞后'} I ${fmt(Math.abs(delta))}°，对应 ${fmt(Math.abs(delta)/360*solution.period_ms)} ms。`, `Vₛ ${delta>0?'leads':'lags'} I by ${fmt(Math.abs(delta))}°, equivalent to ${fmt(Math.abs(delta)/360*solution.period_ms)} ms.`);
    find('[data-phase-text]').textContent = phaseText + ' ' + words('实线：vₛ / V̂ₛ；蓝色虚线：i / Î。', 'Solid: vₛ / V̂ₛ; blue dashed: i / Î.');
    if (runner) { runner.markStale(); runner.redraw(); }
  }
  all('[data-param]').forEach(input => input.addEventListener('input', () => {
    state[input.dataset.param] = Number(input.value);
    all('[data-preset]').forEach(button => button.setAttribute('aria-pressed','false'));
    render();
  }));
  all('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const name = button.dataset.preset;
    state = {...(name === 'practice' ? model.practice : model.defaults)};
    if (name === 'aligned') state.vx_angle_deg = state.vs_angle_deg;
    if (name === 'opposed') { state.vx_rms=state.vs_rms; state.vx_angle_deg=-150; }
    all('[data-preset]').forEach(item => item.setAttribute('aria-pressed', String(item===button)));
    render();
  }));
  find('[data-preset="baseline"]').setAttribute('aria-pressed','true');
  find('[data-cursor]').addEventListener('input', drawWaves);
  render();

  const samples = {
    baseline:`# case is a fresh snapshot of the sliders. Angles are degrees.\n# Try: case["vx_angle_deg"] = case["vs_angle_deg"]\nresult = solve(case)\nz = result["total"]\nprint("VT = {:.3f} + j({:.3f}) V".format(z["re"], z["im"]))\nprint("RMS: {:.3f} V; peak: {:.3f} V".format(z["rms"], z["peak"]))\nprint("Angle (degrees):", z["angle_deg"])\nprint("Numerical RMS: {:.6f} V".format(result["numerical_rms"]))\nprint("Max reconstruction error: {:.2e} V".format(\n    result["reconstruction_error_max"]))`,
    sweep:`# Keep the slider case unchanged; vary only the second voltage phase.\nsweep_case = dict(case)\nrows = []\nprint("phi_x / deg     resultant RMS / V")\nfor phase in range(-180, 181, 30):\n    sweep_case["vx_angle_deg"] = phase\n    result = solve(sweep_case)\n    magnitude = result["total"]["rms"]\n    rows.append((magnitude, phase))\n    print("{:>7}         {:>10.3f}".format(phase, magnitude))\nprint("Sampled maximum (RMS, phase):", max(rows))\nprint("Sampled minimum (RMS, phase):", min(rows))\n# The plot shows the final scan case, phi_x = 180 degrees.\n# A 30-degree grid may miss the exact extrema for other slider phases.`
  };
  function acceptResult(r) {
    if (!r || !r.total || !r.waveform || !r.parameters) return false;
    if (!Object.keys(model.defaults).every(key => Number.isFinite(r.parameters[key])) || r.parameters.omega<=0) return false;
    if (!['re','im','rms','peak'].every(key => Number.isFinite(r.total[key]))) return false;
    if (r.total.rms < 0 || r.total.peak < 0 || !(r.total.angle_deg===null || Number.isFinite(r.total.angle_deg))) return false;
    const t=r.waveform.t_ms, values=r.waveform.total_v;
    return Array.isArray(t) && Array.isArray(values) && t.length>=2 && t.length<=10000 && t.length===values.length &&
      t.every((v,i) => Number.isFinite(v) && v>=0 && (i===0 || v>t[i-1])) && values.every(Number.isFinite);
  }
  if (window.CoursePythonRunner) {
    const codeRoot=find('#l05-python'), summary=find('[data-code-summary]');
    runner = window.CoursePythonRunner({root:codeRoot, snapshot:()=>({...state}), sample:samples.baseline, zh,
      filename:'ece685_l05_phasors.py', invalidLabel:words('没有可绘制的相量结果；请把 solve(case) 的输出赋给 result，并检查模型输出。', 'No phasor result to plot; assign solve(case) to result and check the model output.'),
      acceptResult, drawResult(svg,r) {
        waveChart(svg,[{t:solution.waveform.t_ms,values:solution.waveform.total_v,color:colors.reference,dash:'7 4',width:3},
          {t:r.waveform.t_ms,values:r.waveform.total_v,color:colors.code}]);
        summary.hidden=false;
        summary.textContent=words('蓝色实线：上次代码运行；灰色虚线：当前滑块参考。', 'Blue solid: last Python run; gray dashed: current slider reference.') +
          ` Python: RMS = ${fmt(r.total.rms)} V; φ = ${angle(r.total.angle_deg)}; ` + words('峰值', 'peak') + ` = ${fmt(r.total.peak)} V. ` +
          words('代码输入', 'Code inputs') + `: Vₛ = ${r.parameters.vs_rms} ∠ ${r.parameters.vs_angle_deg}°, Vₓ = ${r.parameters.vx_rms} ∠ ${r.parameters.vx_angle_deg}°, ω = ${r.parameters.omega} rad/s.`;
      }});
    new MutationObserver(() => { summary.hidden=codeRoot.querySelector('.bf-code-result').hidden; }).observe(codeRoot.querySelector('.bf-code-result'),{attributes:true,attributeFilter:['hidden']});
    const markEdited=()=>{
      const status=codeRoot.querySelector('[data-code-status]');
      if (status.dataset.state==='running') return;
      status.dataset.state='edited';
      status.textContent=words('代码已修改；再次运行以更新代码结果。', 'Code changed; run again to update the code result.');
    };
    ['[data-experiment-editor]','[data-solver-editor]'].forEach(selector=>codeRoot.querySelector(selector).addEventListener('input',markEdited));
    ['[data-code-reset]','[data-solver-reset]'].forEach(selector=>codeRoot.querySelector(selector).addEventListener('click',markEdited));
    all('[data-code-example]').forEach(button => button.addEventListener('click',()=>{
      codeRoot.querySelector('[data-experiment-editor]').value=samples[button.dataset.codeExample];
      codeRoot.querySelector('[data-code-status]').textContent=words('示例已载入；点击运行以更新结果。', 'Example loaded; press Run to update the result.');
    }));
  }

  function feedback(form,message,correct) {
    const output=form.querySelector('[data-feedback]');
    output.textContent=message; output.dataset.correct=String(correct);
  }
  find('[data-diagnostic]').addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget, value=new FormData(form).get('l05-rms');
    feedback(form,value==='120' ? words('正确。120√2 是峰值，除以 √2 得到 RMS = 120 V。', 'Correct. The peak is 120√2; divide it by √2 to get RMS = 120 V.') :
      value==='169.7' ? words('169.7 V 是峰值。相量采用 RMS；请将峰值除以 √2 后再试。', '169.7 V is the peak. Phasors use RMS; divide the peak by √2 and try again.') :
      words('120 已经是 RMS 系数。先识别完整峰值 120√2，再除以 √2，避免重复转换。', '120 is already the RMS coefficient. Identify the full peak 120√2, then divide by √2; avoid converting twice.'), value==='120');
  });
  find('[data-compatibility]').addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget, value=new FormData(form).get('l05-compatible');
    feedback(form,value==='compatible' ? words('正确。统一频率、单位与参考后，才能把相量分量相加。', 'Correct. Matching frequency, units, and references permits component-wise phasor addition.') :
      value==='frequency' ? words('不同频率没有共同的旋转参考，不能用单个固定相量表示其和；需要分别处理频率或回到时域。', 'Different frequencies have no shared rotating reference. Their sum needs separate frequency components or a time-domain description.') :
      words('电压与电流单位不同，可以比较相位，不能直接相加。', 'Voltage and current have different units. Compare their phases; do not add them directly.'), value==='compatible');
  });
  const expected=model.solve(model.practice).total;
  find('[data-numerical-practice]').addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget, inputs=new FormData(form);
    let correct=0;
    ['re','im','rms','angle_deg','peak'].forEach(key=>{
      const answer=Number(inputs.get(key)), error=key==='angle_deg'?Math.abs(model.wrap(answer-expected[key])):Math.abs(answer-expected[key]);
      const passed=Number.isFinite(answer)&&error<=0.05;
      if (passed) correct++;
      form.querySelector(`[name="${key}"]`).setAttribute('aria-invalid',String(!passed));
      const hint=passed ? words('正确', 'Correct') : key==='re' ? words('分别计算并相加两个实部：V cosφ。', 'Add the two real components: V cosφ.') :
        key==='im' ? words('两个角度为负，检查 V sinφ 的符号。', 'Both angles are negative; check the signs of V sinφ.') :
        key==='rms' ? words('用 √(Re² + Im²)，不要直接加幅值或乘 √2。', 'Use √(Re² + Im²), without adding magnitudes or multiplying by √2.') :
        key==='angle_deg' ? words('使用 atan2(Im, Re)，本题位于第四象限。', 'Use atan2(Im, Re); this case lies in quadrant IV.') :
        words('峰值 = √2 × 合成 RMS。', 'Peak = √2 × resultant RMS.');
      form.querySelector(`[data-answer-feedback="${key}"]`).textContent=hint;
    });
    feedback(form,correct===5 ? words('5 / 5 正确。再用自己的话解释 RMS、象限与波形重建，完成本讲学习闭环。', '5 / 5 correct. Complete the loop by explaining RMS, quadrant, and waveform reconstruction in your own words.') : words(`${correct} / 5 正确。按各项提示修正；分步解答已解锁。`, `${correct} / 5 correct. Revise using the hints; the worked solution is now available.`),correct===5);
    find('[data-practice-solution]').hidden=false;
  });
})();
