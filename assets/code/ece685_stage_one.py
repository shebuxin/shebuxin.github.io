"""ECE 685 knowledge teaching models. Python standard library only.

Run solve(case), where case['module'] selects an experiment family.
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
    'transformer-banks': dict(h_kv=138, turns_ratio=10, s_mva=60, h_connection='wye',
                             l_connection='delta', h_delta_order='abc', l_delta_order='abc'),
    'transformer-network': dict(h_kv=138, l_rated_kv=13.8, s_mva=60, s_base_mva=100,
                               r_pu=0.006, x_pu=0.09, tap=1, loading=0, power_factor=0.9),
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


def transformer_banks(p):
    """L17: fixed paired dots and positive supply sequence on both sides.

    Delta joining order names coil directions, not the supply sequence:
    ABC is AB, BC, CA; ACB is AC, BA, CB (lowercase on the L side).
    """
    positive(p, 'h_kv', 'turns_ratio', 's_mva')
    for side in ('h', 'l'):
        choice(p, side+'_connection', ['wye', 'delta'])
        choice(p, side+'_delta_order', ['abc', 'acb'])
    kh = math.sqrt(3) if p['h_connection'] == 'wye' else 1
    kl = math.sqrt(3) if p['l_connection'] == 'wye' else 1
    ratio = p['turns_ratio']*kh/kl
    hcoil = p['h_kv']/kh
    lcoil, lv = hcoil/p['turns_ratio'], p['h_kv']/ratio
    eh_angle = -30 if p['h_connection'] == 'wye' else (0 if p['h_delta_order'] == 'abc' else -60)
    delta = wrap(eh_angle+(30 if p['l_connection'] == 'wye' else (0 if p['l_delta_order'] == 'abc' else 60)))
    ih, il = (p['s_mva']*1000/(math.sqrt(3)*v) for v in (p['h_kv'], lv))
    iwh, iwl = (p['s_mva']*1000/(3*v) for v in (hcoil, lcoil))
    xs = [2+i*.45 for i in range(41)]
    return dict(metrics=dict(line_ratio=ratio,l_line_kv=lv,h_winding_kv=hcoil,l_winding_kv=lcoil,
                             h_line_a=ih,l_line_a=il,h_winding_a=iwh,l_winding_a=iwl,
                             phase_mva=p['s_mva']/3,delta_lh_deg=delta),
                phasors=dict(VAB_H=describe(phasor(p['h_kv'],0)),EH_A=describe(phasor(hcoil,eh_angle)),
                             EL_a=describe(phasor(lcoil,eh_angle)),Vab_L=describe(phasor(lv,delta))),
                checks=dict(h_bank_mva=math.sqrt(3)*p['h_kv']*ih/1000-p['s_mva'],
                            l_bank_mva=math.sqrt(3)*lv*il/1000-p['s_mva'],
                            winding_current_ratio=iwl/iwh-p['turns_ratio'],line_current_ratio=il/ih-ratio),
                plots=[plot(xs,{'LV line voltage':[p['h_kv']/(a*kh/kl) for a in xs],
                                'LV winding voltage':[hcoil/a for a in xs]},'winding ratio a','kV'),
                       plot(xs,{'LV line current':[p['s_mva']*1000*a*kh/kl/(math.sqrt(3)*p['h_kv']) for a in xs],
                                'LV winding current':[p['s_mva']*1000*a/(3*hcoil) for a in xs]},'winding ratio a','A')])


def transformer_network(p):
    """L18 Y–delta ABC/abc branch, excitation neglected, resistance retained.

    H phase voltage is the pu angle reference. Delta_LH=-30, theta_HL=+30.
    H current enters; L current leaves. Series impedance is on the H side;
    tap magnitude changes active H turns while system voltage bases stay fixed.
    """
    positive(p, 'h_kv', 'l_rated_kv', 's_mva', 's_base_mva', 'tap')
    nonnegative(p, 'r_pu', 'x_pu', 'loading')
    bounded(p, 'power_factor', .01, 1)
    ratio = p['h_kv']/p['l_rated_kv']
    a = ratio/math.sqrt(3)
    zbh, zbl = p['h_kv']**2/p['s_base_mva'], p['l_rated_kv']**2/p['s_base_mva']
    z = complex(p['r_pu'],p['x_pu'])*p['s_base_mva']/p['s_mva']
    t = phasor(p['tap'],30)
    ih = phasor(p['loading']*p['s_mva']/p['s_base_mva'],-math.degrees(math.acos(p['power_factor'])))
    vl, il = (1-z*ih)/t, t.conjugate()*ih
    sh, sl = ih.conjugate(), vl*il.conjugate()
    loss = z*abs(ih)**2
    v = describe(vl)
    loading, taps = [i*.03 for i in range(41)], [.9+i*.005 for i in range(41)]
    load_v = lambda k: abs(1-z*phasor(k*p['s_mva']/p['s_base_mva'],-math.degrees(math.acos(p['power_factor']))))/p['tap']
    return dict(metrics=dict(winding_ratio=a*p['tap'],rated_line_ratio=ratio,actual_ideal_line_ratio=ratio*p['tap'],
                             theta_hl_deg=30,delta_lh_deg=-30,z_pu_re=z.real,z_pu_im=z.imag,
                             z_base_h_ohm=zbh,z_base_l_ohm=zbl,z_h_re_ohm=z.real*zbh,z_h_im_ohm=z.imag*zbh,
                             z_l_delta_re_ohm=3*z.real*zbl,z_l_delta_im_ohm=3*z.imag*zbl,
                             l_voltage_pu=v['rms'],l_line_kv=v['rms']*p['l_rated_kv'],l_angle_deg=v['angle_deg'],
                             h_line_a=abs(ih)*p['s_base_mva']*1000/(math.sqrt(3)*p['h_kv']),
                             l_line_a=abs(il)*p['s_base_mva']*1000/(math.sqrt(3)*p['l_rated_kv']),
                             input_p_mw=sh.real*p['s_base_mva'],output_p_mw=sl.real*p['s_base_mva'],
                             series_loss_mw=loss.real*p['s_base_mva']),
                phasors=dict(VH_pu=describe(1+0j),VL_pu=v,IH_pu=describe(ih),IL_pu=describe(il)),
                checks=dict(voltage_equation=abs(1-z*ih-t*vl),real_power_balance=sh.real-sl.real-loss.real,
                            reactive_power_balance=sh.imag-sl.imag-loss.imag,
                            ohmic_base_invariance=z.real*zbh-p['r_pu']*p['h_kv']**2/p['s_mva']),
                plots=[plot(taps,{'LV line voltage':[abs(1-z*ih)/tau*p['l_rated_kv'] for tau in taps]},'H-side tap magnitude tau','kV'),
                       plot(loading,{'LV terminal voltage':[load_v(k) for k in loading]},'rated input-current loading','pu')])


HANDLERS = dict(overview=overview,generation=generation,transformers=transformers)
HANDLERS.update({'single-phase':single_phase,'three-phase':three_phase,'per-unit':per_unit})
HANDLERS.update({'transformer-banks':transformer_banks,'transformer-network':transformer_network})


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
