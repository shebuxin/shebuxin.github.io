/* Commented entry programs for the three power-flow teaching chapters. */
(function (root) {
  'use strict';
  function sample(kind, zh) {
    const comment = (en, cn) => '# ' + (zh ? cn : en);
    const lines = [
      comment('The page supplies case and executes the folded model source first.', '页面先准备 case，并执行上方折叠的模型源码。'),
      comment('main is the experiment entry point; model functions are already defined.', 'main 是本次实验入口；它调用的模型函数已由源码定义。'),
      'def main(input_case):',
      '    ' + comment('1. Copy the inputs; edits here do not change the sliders.', '1. 复制输入；在这里修改不会改变上方滑块。'),
      '    parameters = dict(input_case)'
    ];
    if (kind === 'balanced' || kind === 'unbalanced') {
      lines.push(kind === 'balanced'
        ? '    # parameters["q_support_kvar"] = 60  # kvar'
        : '    # parameters.update(p3_a_kw=60, p3_b_kw=60, p3_c_kw=60)  # kW');
      lines.push('',
        '    ' + comment('2. Call solve from the model source: inputs -> AC power-flow solution.', '2. 调用源码中的 solve：输入参数 → AC 潮流解。'),
        '    solved = solve(parameters)', '',
        '    ' + comment('3. Check convergence before reading voltage or loss fields.', '3. 先检查是否收敛，再读取电压和损耗字段。'),
        '    if not solved["ok"]:',
        '        print("No converged solution:", solved["reason"])',
        '        return solved', '',
        '    ' + comment('4. print shows numerical results in the output panel.', '4. print 将数值结果显示在下面的输出区。'));
      if (kind === 'balanced') {
        lines.push('    for bus in solved["buses"]:',
          '        print(f\'Bus {bus["id"]}: {bus["vm_pu"]:.5f} pu, \'',
          '              f\'{bus["theta_deg"]:.4f} deg\')',
          '    print(f\'Slack supply: {solved["slack_p_kw"]:.4f} kW\')');
      } else {
        lines.push('    ' + comment('List index 2 means physical bus 3 (indices start at 0).', '列表索引 2 对应物理节点 3（索引从 0 开始）。'),
          '    end = solved["buses"][2]',
          '    for phase in end["phases"]:',
          '        print(f\'{phase["phase"].upper()}: {phase["vm_pu"]:.5f} pu, \'',
          '              f\'{phase["voltage_v"]:.2f} V\')',
          '    print(f\'VUF: {end["components"]["vuf_pct"]:.4f}%\')',
          '    print(f\'Neutral shift: {end["neutral_v"]:.3f} V\')');
      }
      lines.push('    print(f\'Total loss: {solved["loss_kw"]:.4f} kW\')',
        '    print("Limit violations:", solved["violations"])');
    } else if (kind === 'pandapower') {
      lines.push('',
        '    ' + comment('2. Build net: input settings -> pandapower equipment tables.', '2. 建立 net：输入参数 → pandapower 设备数据表。'),
        '    net = build_network(parameters)',
        '    ' + comment('In balanced mode, edit net.load here before solving (units: MW / Mvar).', '平衡模式可在这里修改 net.load，再求解（单位：MW / Mvar）。'),
        '    # net.load.loc[net.load.bus == 2, "p_mw"] = 0.240', '',
        '    ' + comment('3. Check supply, then runpp / runpp_3ph fills the result tables.', '3. 检查供电范围，再由 runpp / runpp_3ph 填充结果表。'),
        '    if len(supplied_buses(net)) == 1:',
        '        print("No load bus is connected to the source.")',
        '        return {"ok": False, "reason": "island"}',
        '    try:',
        '        run_network(net, parameters)',
        '    except pp.LoadflowNotConverged as error:',
        '        print("No converged solution:", error)',
        '        return {"ok": False, "reason": "nonconvergence"}', '',
        '    ' + comment('4. Inspect solved tables; convert them to the lesson result dictionary.', '4. 查看求解后的表，并转换成教材使用的结果字典。'),
        '    if parameters["mode"] == "three_phase":',
        '        print(net.res_bus_3ph.round(5))',
        '        print(net.res_line_3ph.round(5))',
        '    else:',
        '        print(net.res_bus.round(5))',
        '        print(net.res_line.round(5))',
        '    solved = collect_results(net, parameters)',
        '    print("Unsupplied bus indices:", solved["unsupplied"])',
        '    print("Total loss (kW):", round(solved["loss_kw"], 5))',
        '    print("Within teaching limits:", solved["secure"])');
    } else {
      throw new Error('Unknown power-flow code example: ' + kind);
    }
    lines.push('    return solved', '',
      comment('5. Run main; the page reads result to draw the Python voltage profile.', '5. 执行 main；页面读取 result 来绘制 Python 电压分布。'),
      'result = main(case)', '');
    return lines.join('\n');
  }

  function showCase(panel, parameters) {
    const preview = panel.querySelector('[data-case-preview]');
    if (!preview) return;
    const literal = value => typeof value === 'boolean' ? (value ? 'True' : 'False') : JSON.stringify(value);
    preview.textContent = 'case = {\n' + Object.entries(parameters)
      .map(([key, value]) => '    ' + JSON.stringify(key) + ': ' + literal(value) + ',').join('\n') + '\n}';
  }
  const api = { sample, showCase };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PowerFlowCodeExamples = api;
})(typeof window === 'undefined' ? globalThis : window);
