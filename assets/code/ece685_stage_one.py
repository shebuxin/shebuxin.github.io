"""ECE 685 first-stage teaching models. Python standard library only.

Run solve(case), where case['module'] selects one of the seven modules.
The source examples and simplifications are described in each web lesson.
This is an editable teaching model, with no external solver or server dependency.
"""
import cmath
import math

DEFAULTS = {
    'overview': dict(load_mw=80, load_mvar=30, shunt_mvar=10, line_loss_mw=3,
                     line_mvar=5, transformer_loss_mw=1, transformer_mvar=2, transmission_kv=138),
    'generation': dict(demand_scale=1, accredited_mw=4850, prm_percent=15, hours=2000,
                       gt_fixed=217000, gt_variable=40.901, cc_fixed=284000, cc_variable=26.05,
                       wind_mw=500, solar_mw=300, wind_credit=0, solar_credit=0),
    'single-phase': dict(voltage_rms=120, current_rms=10, delta_deg=50, omega=377, target_pf=0.95),
    'three-phase': dict(voltage_ll=400, resistance=20, reactance=15, connection='wye',
                        sequence='abc', phase_ref_deg=0, omega=377),
    'transformers': dict(h_kv=138, turns_ratio=10, s_mva=30, loading=0.8, power_factor=0.9,
                         h_connection='wye', l_connection='wye', r_pu=0.01, x_pu=0.08, core_kw=30,
                         oc_v=240, oc_a=2, oc_w=120, sc_v=120, sc_a=4.1667, sc_w=180),
    'per-unit': dict(system='three-phase', s_base_mva=100, v_base_h_kv=138, turns_ratio=10,
                     v_actual_l_kv=13.8, current_a=600, z_re_ohm=1, z_im_ohm=4, power_factor=0.9),
    'exam-review': dict(focus='single-phase', voltage_rms=180, current_rms=12, v_phase_deg=-20,
                        i_phase_deg=10, delta_voltage_ll=208, delta_r=8, delta_x=6, s_base_kva=30,
                        v_base_h_v=1500, turns_ratio=10, z_h_re=1.5, z_h_im=3.4369, peak_mw=160,
                        prm_percent=15, gt_fixed=75000, gt_variable=85, cc_fixed=195000,
                        cc_variable=45, hours=2000),
}


def wrap(degrees):
    return (degrees + 180) % 360 - 180


def phasor(magnitude, degrees):
    return cmath.rect(magnitude, math.radians(degrees))


def describe(z):
    return dict(re=z.real, im=z.imag, rms=abs(z),
                angle_deg=None if abs(z) < 1e-12 else wrap(math.degrees(cmath.phase(z))))


def positive(p, *keys):
    for key in keys:
        if p[key] <= 0:
            raise ValueError(key + ' must be positive')


def nonnegative(p, *keys):
    for key in keys:
        if p[key] < 0:
            raise ValueError(key + ' must be nonnegative')


def bounded(p, key, low, high):
    if not low <= p[key] <= high:
        raise ValueError(f'{key} must be in [{low}, {high}]')


def choice(p, key, choices):
    if p[key] not in choices:
        raise ValueError(key + ' must be one of ' + ', '.join(choices))


def plot(x, curves, x_unit, y_unit):
    return dict(x=x, curves=[dict(name=name, values=values) for name, values in curves.items()],
                x_unit=x_unit, y_unit=y_unit)


def screening(p):
    difference = p['gt_variable'] - p['cc_variable']
    return dict(crossover_hours=None if difference == 0 else
                (p['cc_fixed'] - p['gt_fixed']) / difference,
                gt_cost=p['gt_fixed'] + p['gt_variable'] * p['hours'],
                cc_cost=p['cc_fixed'] + p['cc_variable'] * p['hours'])


def overview(p):
    positive(p, 'transmission_kv')
    nonnegative(p, 'load_mw', 'shunt_mvar', 'line_loss_mw', 'transformer_loss_mw')
    receive_q = p['load_mvar'] - p['shunt_mvar']
    line_p = p['load_mw'] + p['line_loss_mw']
    line_q = receive_q + p['line_mvar']
    power = line_p + p['transformer_loss_mw']
    reactive = line_q + p['transformer_mvar']
    return dict(metrics=dict(generator_mw=power, generator_mvar=reactive, net_load_mvar=receive_q,
                             generator_mva=math.hypot(power, reactive),
                             transmission_current_a=math.hypot(line_p, line_q)*1000/(math.sqrt(3)*p['transmission_kv'])),
                checks=dict(p_balance=power-p['load_mw']-p['line_loss_mw']-p['transformer_loss_mw'],
                            q_balance=reactive+p['shunt_mvar']-p['load_mvar']-p['line_mvar']-p['transformer_mvar']),
                plots=[plot([0, 1, 2, 3], dict(P=[power, line_p, p['load_mw'], p['load_mw']],
                                               Q=[reactive, line_q, receive_q, p['load_mvar']]), 'node', 'MW / Mvar')])


def generation(p):
    positive(p, 'demand_scale')
    nonnegative(p, 'accredited_mw', 'prm_percent', 'hours', 'gt_fixed', 'gt_variable',
                'cc_fixed', 'cc_variable', 'wind_mw', 'solar_mw')
    bounded(p, 'hours', 0, 8760)
    bounded(p, 'wind_credit', 0, 1)
    bounded(p, 'solar_credit', 0, 1)
    chronological = [v*p['demand_scale'] for v in (2500,2300,2200,2400,2900,3500,4000,4200,3900,4380,3700,3000)]
    ordered = sorted(chronological, reverse=True)
    peak = max(chronological)
    target = peak * (1+p['prm_percent']/100)
    annual_x = [0, 1000, 4000, 7000, 8760]
    annual_load = [v*p['demand_scale'] for v in (4200,3400,2600,1800,1800)]
    net = [max(0, v-p['wind_mw']-p['solar_mw']) for v in annual_load]
    cc_capacity = 0
    for i in range(4):
        next_level = 0 if i == 3 else net[i+1]
        layer, duration = max(0, net[i]-next_level), annual_x[i+1]
        if p['cc_fixed']+p['cc_variable']*duration < p['gt_fixed']+p['gt_variable']*duration:
            cc_capacity += layer
    cc_units = math.ceil(cc_capacity/543)
    gt_units = math.ceil(max(0, net[0]-cc_units*543)/211)
    accredited = cc_units*543 + gt_units*211 + p['wind_mw']*p['wind_credit'] + p['solar_mw']*p['solar_credit']
    annual_target = annual_load[0]*(1+p['prm_percent']/100)
    extra_gt = math.ceil(max(0, annual_target-accredited)/211)
    hours = [8760*i/44 for i in range(45)]
    metrics = dict(energy_mwh=sum(chronological)*2, daily_peak_mw=peak, capacity_target_mw=target,
                   capacity_gap_mw=max(0,target-p['accredited_mw']), current_prm_percent=(p['accredited_mw']/peak-1)*100,
                   cc_units=cc_units, gt_units_load=gt_units, extra_gt_prm=extra_gt,
                   mix_accredited_mw=accredited+extra_gt*211, annual_target_mw=annual_target, **screening(p))
    return dict(metrics=metrics,
                checks=dict(sorted_energy_difference=(sum(chronological)-sum(ordered))*2,
                            annual_load_covered=int(cc_units*543+gt_units*211 >= net[0]),
                            reserve_met=int(accredited+extra_gt*211 >= annual_target)),
                plots=[dict(plot([2*i for i in range(13)], {'clock-time load':chronological+[chronological[-1]], 'sorted duration load':ordered+[ordered[-1]]}, 'h', 'MW'),step=True),
                       plot(hours, dict(GT=[p['gt_fixed']+p['gt_variable']*t for t in hours],
                                        CC=[p['cc_fixed']+p['cc_variable']*t for t in hours]), 'h/year', '$/MW-year')],
                annual=dict(hours=annual_x, load=annual_load, net_load=net))


def single_phase(p):
    positive(p, 'voltage_rms', 'omega')
    nonnegative(p, 'current_rms')
    bounded(p, 'delta_deg', -89, 89)
    bounded(p, 'target_pf', 0.01, 1)
    apparent = p['voltage_rms']*p['current_rms']
    power, reactive = apparent*math.cos(math.radians(p['delta_deg'])), apparent*math.sin(math.radians(p['delta_deg']))
    target_q = power*math.tan(math.acos(p['target_pf']))
    qc = max(0, reactive-target_q) if reactive > 0 else 0
    corrected_s = math.hypot(power, reactive-qc)
    times = [i/240*4*math.pi/p['omega']*1000 for i in range(241)]
    v = [math.cos(p['omega']*t/1000) for t in times]
    current = [math.cos(p['omega']*t/1000-math.radians(p['delta_deg'])) for t in times]
    return dict(metrics=dict(p_w=power, q_var=reactive, s_va=apparent, pf=None if p['current_rms']==0 else math.cos(math.radians(p['delta_deg'])),
                             capacitor_var=qc, capacitance_uf=qc/(p['omega']*p['voltage_rms']**2)*1e6,
                             corrected_pf=None if corrected_s==0 else power/corrected_s,
                             current_after_a=corrected_s/p['voltage_rms'], frequency_hz=p['omega']/(2*math.pi)),
                phasors=dict(V=describe(phasor(p['voltage_rms'],0)), I=describe(phasor(p['current_rms'],-p['delta_deg']))),
                checks=dict(power_triangle=apparent-math.hypot(power, reactive)),
                plots=[plot(times, {'v / peak':v, 'i / peak':current}, 'ms', 'normalized'),
                       plot(times, {'p(t)':[2*apparent*a*b for a,b in zip(v,current)], 'P (average)':[power]*len(times)}, 'ms', 'W')])


def three_phase(p):
    positive(p, 'voltage_ll', 'omega')
    nonnegative(p, 'resistance')
    impedance = complex(p['resistance'],p['reactance'])
    if impedance == 0:
        raise ValueError('Load impedance must be nonzero')
    choice(p, 'connection', ('wye','delta'))
    choice(p, 'sequence', ('abc','acb'))
    shift = -120 if p['sequence']=='abc' else 120
    voltage = p['voltage_ll']/math.sqrt(3)
    phases = [phasor(voltage,p['phase_ref_deg']+i*shift) for i in range(3)]
    line_voltages = [phases[i]-phases[(i+1)%3] for i in range(3)]
    branch = [v/impedance for v in (phases if p['connection']=='wye' else line_voltages)]
    line = branch if p['connection']=='wye' else [branch[i]-branch[(i+2)%3] for i in range(3)]
    power = sum(v*i.conjugate() for v,i in zip(phases,line))
    times = [i/240*4*math.pi/p['omega']*1000 for i in range(241)]
    def wave(z):
        return [math.sqrt(2)*abs(z)*math.cos(p['omega']*t/1000+cmath.phase(z)) for t in times]
    volts, currents = [wave(v) for v in phases], [wave(i) for i in line]
    instantaneous = [sum(volts[j][i]*currents[j][i] for j in range(3)) for i in range(len(times))]
    branch_v = voltage if p['connection']=='wye' else p['voltage_ll']
    return dict(metrics=dict(voltage_ll=p['voltage_ll'], branch_voltage=branch_v, branch_current_a=abs(branch[0]),
                             line_current_a=abs(line[0]), p_w=power.real, q_var=power.imag, s_va=abs(power),
                             pf=p['resistance']/abs(impedance), neutral_current_a=abs(sum(line)), line_angle_deg=describe(line[0])['angle_deg']),
                phasors=dict(Va=describe(phases[0]),Vb=describe(phases[1]),Vc=describe(phases[2]),Vab=describe(line_voltages[0]),
                             Ia=describe(line[0]),Ibranch=describe(branch[0])),
                checks=dict(instantaneous_power_ripple=max(instantaneous)-min(instantaneous),
                            real_power_balance=power.real-3*branch_v**2*p['resistance']/abs(impedance)**2),
                plots=[plot(times,dict(Va=volts[0],Vb=volts[1],Vc=volts[2]),'ms','V'),
                       plot(times,dict(Ia=currents[0],Ib=currents[1],Ic=currents[2]),'ms','A')])


def transformer_tests(p):
    positive(p, 'oc_v','oc_a','oc_w','sc_v','sc_a','sc_w')
    if p['oc_w'] >= p['oc_v']*p['oc_a'] or p['sc_w'] > p['sc_v']*p['sc_a']:
        raise ValueError('Test real power must not exceed apparent power; OC needs a magnetizing component')
    ic = p['oc_w']/p['oc_v']
    im = math.sqrt(p['oc_a']**2-ic**2)
    rc, xm = p['oc_v']**2/p['oc_w'], p['oc_v']/im
    z, r = p['sc_v']/p['sc_a'], p['sc_w']/p['sc_a']**2
    return dict(rc_lv_ohm=rc,xm_lv_ohm=xm,req_hv_ohm=r,xeq_hv_ohm=math.sqrt(max(0,z*z-r*r)),
                rc_hv_ohm=100*rc,xm_hv_ohm=100*xm)


def transformers(p):
    positive(p, 'h_kv','turns_ratio','s_mva')
    nonnegative(p, 'loading','r_pu','x_pu','core_kw')
    bounded(p, 'power_factor',0.01,1)
    choice(p, 'h_connection',('wye','delta'))
    choice(p, 'l_connection',('wye','delta'))
    kh = math.sqrt(3) if p['h_connection']=='wye' else 1
    kl = math.sqrt(3) if p['l_connection']=='wye' else 1
    high_winding = p['h_kv']/kh
    low_winding = high_winding/p['turns_ratio']
    low_line = low_winding*kl
    apparent = p['s_mva']*p['loading']
    high_i, low_i = apparent*1000/(math.sqrt(3)*p['h_kv']), apparent*1000/(math.sqrt(3)*low_line)
    sin_phi = math.sqrt(1-p['power_factor']**2)
    regulation = p['loading']*(p['r_pu']*p['power_factor']+p['x_pu']*sin_phi)
    output = apparent*p['power_factor']
    copper, core = p['r_pu']*p['s_mva']*p['loading']**2, p['core_kw']/1000
    metrics = dict(h_winding_kv=high_winding,l_winding_kv=low_winding,l_line_kv=low_line,
                   line_ratio=p['h_kv']/low_line,h_line_a=high_i,l_line_a=low_i,
                   h_winding_a=high_i/(math.sqrt(3) if p['h_connection']=='delta' else 1),
                   l_winding_a=low_i/(math.sqrt(3) if p['l_connection']=='delta' else 1),
                   output_mw=output,copper_loss_mw=copper,efficiency_percent=output/(output+copper+core)*100 if output+copper+core else 0,
                   regulation_percent=regulation*100,loaded_l_line_kv=low_line*(1-regulation),**transformer_tests(p))
    fractions = [i/40 for i in range(41)]
    def efficiency(v):
        real = p['s_mva']*v*p['power_factor']
        return 0 if real == 0 else 100*real/(real+p['r_pu']*p['s_mva']*v*v+core)
    return dict(metrics=metrics,
                checks=dict(ideal_bank_power=apparent-math.sqrt(3)*low_line*low_i/1000,
                            ampere_turn_ratio=p['turns_ratio']*metrics['h_winding_a']-metrics['l_winding_a']),
                plots=[plot(fractions,{'approx. regulation':[100*v*(p['r_pu']*p['power_factor']+p['x_pu']*sin_phi) for v in fractions]},'loading pu','%'),
                       plot(fractions,dict(efficiency=[efficiency(v) for v in fractions]),'loading pu','%')])


def per_unit(p):
    positive(p, 's_base_mva','v_base_h_kv','turns_ratio','v_actual_l_kv')
    nonnegative(p,'current_a')
    bounded(p,'power_factor',0.01,1)
    choice(p,'system',('single-phase','three-phase'))
    factor = math.sqrt(3) if p['system']=='three-phase' else 1
    vb = p['v_base_h_kv']/p['turns_ratio']
    ib = p['s_base_mva']*1000/(factor*vb)
    zb, zhb = vb*vb/p['s_base_mva'], p['v_base_h_kv']**2/p['s_base_mva']
    zre, zim = p['z_re_ohm']/zb, p['z_im_ohm']/zb
    apparent = factor*p['v_actual_l_kv']*p['current_a']/1000
    bases = [20+i*4.5 for i in range(41)]
    return dict(metrics=dict(v_base_l_kv=vb,i_base_l_a=ib,i_base_h_a=ib/p['turns_ratio'],z_base_l_ohm=zb,z_base_h_ohm=zhb,
                             v_pu=p['v_actual_l_kv']/vb,i_pu=p['current_a']/ib,z_pu_re=zre,z_pu_im=zim,s_pu=apparent/p['s_base_mva'],
                             physical_s_mva=apparent,physical_p_mw=apparent*p['power_factor'],recovered_z_re_ohm=zre*zb,
                             recovered_z_im_ohm=zim*zb,referred_z_re_ohm=p['z_re_ohm']*p['turns_ratio']**2),
                checks=dict(reconstruction_re=zre*zb-p['z_re_ohm'],reconstruction_im=zim*zb-p['z_im_ohm'],
                            referral_invariance=p['z_re_ohm']*p['turns_ratio']**2/zhb-zre,
                            power_base_identity=(p['v_actual_l_kv']/vb)*(p['current_a']/ib)-apparent/p['s_base_mva']),
                plots=[plot(bases,{'Re(Zpu)':[p['z_re_ohm']*b/vb**2 for b in bases],'Im(Zpu)':[p['z_im_ohm']*b/vb**2 for b in bases]},'Sbase / MVA','pu'),
                       plot(bases,{'recovered Re(Z)':[p['z_re_ohm']]*len(bases),'recovered Im(Z)':[p['z_im_ohm']]*len(bases)},'Sbase / MVA','ohm')])


def exam_review(p):
    positive(p,'voltage_rms','current_rms','delta_voltage_ll','s_base_kva','v_base_h_v','turns_ratio','peak_mw')
    nonnegative(p,'delta_r','prm_percent','gt_fixed','gt_variable','cc_fixed','cc_variable','hours')
    choice(p,'focus',('single-phase','three-phase','planning'))
    delta = wrap(p['v_phase_deg']-p['i_phase_deg'])
    power = p['voltage_rms']*p['current_rms']*math.cos(math.radians(delta))
    reactive = p['voltage_rms']*p['current_rms']*math.sin(math.radians(delta))
    three = three_phase(dict(DEFAULTS['three-phase'],voltage_ll=p['delta_voltage_ll'],resistance=p['delta_r'],
                             reactance=p['delta_x'],connection='delta',phase_ref_deg=-30))
    zb = p['v_base_h_v']**2/(p['s_base_kva']*1000)
    low_v = p['v_base_h_v']/p['turns_ratio']
    zbl = low_v**2/(p['s_base_kva']*1000)
    times = [i/240*4*math.pi/377*1000 for i in range(241)]
    hours = [8760*i/44 for i in range(45)]
    single_plot = plot(times,{'v / peak':[math.cos(377*t/1000+math.radians(p['v_phase_deg'])) for t in times],
                             'i / peak':[math.cos(377*t/1000+math.radians(p['i_phase_deg'])) for t in times]},'ms','normalized')
    plots = [single_plot] if p['focus']=='single-phase' else three['plots'] if p['focus']=='three-phase' else [
        plot(hours,dict(GT=[p['gt_fixed']+p['gt_variable']*t for t in hours],
                        CC=[p['cc_fixed']+p['cc_variable']*t for t in hours]),'h/year','$/MW-year')]
    return dict(metrics=dict(p_w=power,q_var=reactive,pf=abs(math.cos(math.radians(delta))),delta_line_a=three['metrics']['line_current_a'],
                             delta_p_w=three['metrics']['p_w'],delta_q_var=three['metrics']['q_var'],z_pu_re=p['z_h_re']/zb,z_pu_im=p['z_h_im']/zb,
                             ib_h_a=p['s_base_kva']*1000/p['v_base_h_v'],ib_l_a=p['s_base_kva']*1000/low_v,
                             required_capacity_mw=p['peak_mw']*(1+p['prm_percent']/100),**screening(p)),
                checks=dict(per_unit_referral=p['z_h_re']/p['turns_ratio']**2/zbl-p['z_h_re']/zb),
                phasors=three['phasors'],plots=plots)


HANDLERS = dict(overview=overview,generation=generation,transformers=transformers)
HANDLERS.update({'single-phase':single_phase,'three-phase':three_phase,'per-unit':per_unit,'exam-review':exam_review})


def solve(case):
    module = case.get('module','overview')
    if module not in DEFAULTS:
        raise ValueError('Unknown teaching module')
    parameters = dict(DEFAULTS[module])
    parameters.update({key:value for key,value in case.items() if key != 'module'})
    for key,value in DEFAULTS[module].items():
        if isinstance(value,(int,float)):
            candidate = parameters[key]
            if isinstance(candidate,bool) or not isinstance(candidate,(int,float)) or not math.isfinite(candidate):
                raise ValueError(key+' must be finite')
    return dict(module=module,parameters=parameters,**HANDLERS[module](parameters))
