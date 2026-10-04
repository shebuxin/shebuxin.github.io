"""Course-authored vector diagrams and plots from the downloadable solver.

All response curves are calculated; schematic arrows describe declared models.
Run after changing figure design or teaching-model baselines.
"""
import cmath
import hashlib
import html
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/images/ibr-modeling'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'assets/code/ibr-modeling.py'
spec = importlib.util.spec_from_file_location('ibr_teaching', SOURCE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
INK, BLUE, GOLD, TEAL, MUTED, LINE = '#17374b', '#2f7095', '#bd733d', '#377e70', '#667c87', '#d7e1e5'
MANIFEST = {}

def esc(text): return html.escape(str(text))
def tr(lang, en, zh): return zh if lang == 'zh' else en
def text_units(text): return sum(1 if ord(c)>255 else .55 for c in text)

class Drawing:
    def __init__(self, name, lang, title, w=1040, h=460):
        self.name, self.lang, self.title, self.w, self.h = name, lang, title, w, h
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc" lang="{lang}">',
          f'<title id="title">{esc(title)}</title><desc id="desc">{esc(title)}. '+tr(lang,'Course-authored schematic or calculated response.','课程绘制的结构图或计算响应。')+'</desc>',
          '<defs>'+''.join(f'<marker id="arrow{i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{c}"/></marker>' for i,c in enumerate([INK,BLUE,GOLD,TEAL,MUTED]))+'</defs>',
          '<style>text{font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif} .small{font-size:17px} .label{font-size:20px;font-weight:600} .note{font-size:18px} .title{font-size:26px;font-weight:600}</style>',
          f'<rect width="{w}" height="{h}" rx="18" fill="#fbfcfc"/>']
    def text(self,x,y,text,size=20,color=INK,anchor='start',weight=400):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}" font-weight="{weight}">{esc(text)}</text>')
    def path(self,d,color=INK,width=2,arrow=False,dash=False):
        i=[INK,BLUE,GOLD,TEAL,MUTED].index(color) if color in [INK,BLUE,GOLD,TEAL,MUTED] else 0
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"'+(f' marker-end="url(#arrow{i})"' if arrow else '')+(' stroke-dasharray="6 5"' if dash else '')+'/>')
    def line(self,x1,y1,x2,y2,**kw):self.path(f'M{x1} {y1}L{x2} {y2}',**kw)
    def rect(self,x,y,w,h,color='#fff',stroke=LINE,r=10):self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{color}" stroke="{stroke}"/>')
    def circle(self,x,y,r,fill='#fff',stroke=INK):self.parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    def node(self,x,y):self.circle(x,y,4,INK,INK)
    def block(self,x,y,w,h,title,subtitle='',color=BLUE):
        self.rect(x,y,w,h,'#fff',color)
        lines=title.split('|')
        for i,line in enumerate(lines):self.text(x+w/2,y+30+i*25,line,min(20,(w-24)/max(text_units(line),1)),color,'middle',600)
        if subtitle:self.text(x+w/2,y+h-16,subtitle,min(16,(w-20)/max(text_units(subtitle),1)),MUTED,'middle')
    def coil(self,x,y,length=80,color=INK):
        d=f'M{x} {y}'
        for k in range(4):d+=f' c0 -22 {length/4} -22 {length/4} 0'
        self.path(d,color,2.5)
    def footer(self,text):self.text(32,self.h-24,text,min(17,(self.w-64)/max(text_units(text),1)),MUTED)
    def save(self,case=None):
        if case is not None:self.parts.append('<metadata>'+esc(json.dumps({'case':case,'solver_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest()}))+'</metadata>')
        p=OUT/f'{self.name}-{self.lang}.svg';p.write_text('\n'.join(self.parts)+ '\n</svg>\n')
        MANIFEST.setdefault(self.name,{})[self.lang]={'path':str(p.relative_to(ROOT)), 'title':self.title, 'width':self.w, 'height':self.h}

def circuit(lang):
    d=Drawing('lcl-circuit',lang,tr(lang,'Three energy stores, six electrical states','三类储能元件，六个电气状态'),h=440)
    d.text(32,44,tr(lang,'AVERAGED ELECTRICAL PLANT','平均电气电路'),17,BLUE,weight=600)
    d.rect(55,115,115,140,'#eef4f7',BLUE)
    d.text(112,162,'VSC',25,BLUE,'middle',600);d.text(112,192,tr(lang,'average u','平均电压 u'),18,BLUE,'middle')
    d.line(170,180,220,180);d.coil(220,180);d.line(300,180,425,180);d.node(425,180)
    d.line(425,180,425,238);d.line(400,238,450,238,width=3);d.line(400,250,450,250,width=3);d.line(425,250,425,328)
    d.line(425,180,525,180);d.coil(525,180);d.line(605,180,690,180);d.node(690,180)
    d.line(690,180,755,180);d.coil(755,180);d.line(835,180,920,180);d.circle(949,180,30);d.text(949,189,'~',29,INK,'middle');d.line(949,210,949,328);d.line(112,255,112,328);d.line(112,328,949,328)
    for x,label in [(260,'r₁, ℓ₁'),(560,'r_f2, ℓ_f2'),(793,'r_g, ℓ_g')]:d.text(x,132,label,20,INK,'middle')
    d.text(456,246,'c',22,TEAL);d.text(425,365,'v_cd , v_cq',20,TEAL,'middle',600)
    d.text(690,223,'PoC',20,BLUE,'middle',600);d.text(949,259,'V_g',22,INK,'middle')
    d.line(310,156,370,156,color=GOLD,arrow=True);d.text(340,102,'i₁d , i₁q',20,GOLD,'middle',600)
    d.line(622,155,672,155,color=GOLD,arrow=True);d.text(650,102,'i₂d , i₂q',20,GOLD,'middle',600)
    d.footer(tr(lang,'Power at the capacitor and at PoC are distinct measurements.','电容端功率与 PoC 功率是不同的测量量。'));d.save()

def fidelity(lang):
    d=Drawing('model-boundaries',lang,tr(lang,'Choose a representation from the question','由研究问题选择模型表示'),h=420)
    titles=[tr(lang,'Switching','开关表示'),tr(lang,'Averaged dq','平均 dq 表示'),tr(lang,'Low-frequency','低频表示')]
    subtitles=[tr(lang,'switching actions','具体开关动作'),tr(lang,'plant + control states','电路与控制状态'),tr(lang,'selected envelope states','选定包络状态')]
    questions=[tr(lang,'Ripple / switching effects','纹波 / 开关影响'),tr(lang,'LCL / inner-loop interaction','LCL / 内环相互作用'),tr(lang,'Synchronization / power','同步 / 功率响应')]
    for k,x in enumerate([32,376,720]):
        d.rect(x,45,288,290,'#fff');d.text(x+24,79,'0'+str(k+1),17,[BLUE,TEAL,GOLD][k],weight=600);d.text(x+24,119,titles[k],25,INK,weight=600)
        pts=[]
        for i in range(61):
            t=i/60;val=math.sin(t*math.pi*3)
            if k==0:val+=.22*(1 if math.sin(t*math.pi*30)>0 else -1)
            pts.append((x+24+240*t,180-24*val))
        d.path(' '.join(('M' if i==0 else 'L')+f'{a:.2f} {b:.2f}' for i,(a,b) in enumerate(pts)),[BLUE,TEAL,GOLD][k],2.5)
        d.text(x+24,242,subtitles[k],18,MUTED);d.text(x+24,290,questions[k],18,INK,weight=600)
    d.footer(tr(lang,'Different retained dynamics → different questions. These waveforms are schematic.','保留的动态不同，能回答的问题不同；波形为示意图。'));d.save()

def frames(lang):
    d=Drawing('reference-frames',lang,tr(lang,'Rotate both vectors; physical power is invariant','同时旋转电压和电流，物理功率保持不变'),h=450)
    for cx,label,ang in [(250,tr(lang,'Grid-aligned frame','电网对齐坐标'),0),(735,tr(lang,'Frame offset +20°','坐标偏差 +20°'),math.radians(20))]:
        cy=237;d.circle(cx,cy,117,'#fff',LINE)
        d.line(cx-136,cy,cx+146,cy,color=MUTED,arrow=True);d.line(cx,cy+132,cx,cy-146,color=MUTED,arrow=True)
        d.text(cx+150,cy+25,'D' if ang==0 else 'd',18,MUTED);d.text(cx+10,cy-140,'Q' if ang==0 else 'q',18,MUTED)
        va=-ang;ia=-ang-math.pi/6
        d.line(cx,cy,cx+108*math.cos(va),cy-108*math.sin(va),color=BLUE,width=3,arrow=True)
        d.line(cx,cy,cx+86*math.cos(ia),cy-86*math.sin(ia),color=GOLD,width=3,arrow=True)
        d.text(cx+121*math.cos(va),cy-121*math.sin(va)-10,'V',22,BLUE)
        d.text(cx+96*math.cos(ia)+4,cy-96*math.sin(ia)+15,'I',22,GOLD)
        d.text(cx,55,label,24,INK,'middle',600)
        d.text(cx,397,'v_d = 1, v_q = 0' if not ang else 'v_d = 0.940, v_q = −0.342',19,INK,'middle')
    d.line(455,235,530,235,color=TEAL,arrow=True);d.text(492,204,'T(θ)',19,TEAL,'middle')
    d.footer('P = 0.519615 pu     Q = +0.300000 pu   ·   '+tr(lang,'power-invariant Park transform','功率不变 Park 变换'));d.save()

def gfl(lang):
    d=Drawing('gfl-control',lang,tr(lang,'A GFL loop follows voltage angle and regulates current','GFL 跟踪电压角度，再调节注入电流'),h=490)
    y=120
    for x,w,title,sub in [(32,152,'P* / Q*',tr(lang,'commands','功率指令')),(238,177,tr(lang,'P–Q inverse','P–Q 逆映射'),'i_d* , i_q*'),(474,179,tr(lang,'Current actuator','电流执行环节'),'τ_i = 20 ms'),(714,176,tr(lang,'Grid network','电网网络'),'V = V_g + Z_g I')]:d.block(x,y,w,95,title,sub)
    for a,b in [(184,238),(415,474),(653,714)]:d.line(a,y+45,b-7,y+45,color=BLUE,arrow=True)
    d.line(890,165,1000,165,color=BLUE,arrow=True);d.text(953,132,'V, I',19,BLUE,'middle')
    d.block(497,324,204,94,'SRF PLL',tr(lang,'v_q → PI → ω̂ → δ','v_q → PI → ω̂ → δ'),TEAL)
    d.path('M950 165 V369 H708',TEAL,2,True)
    d.path('M497 369 H322 V223',TEAL,2,True)
    d.text(360,352,tr(lang,'Local dq frame','局部 dq 坐标'),18,TEAL)
    d.footer(tr(lang,'Four teaching states: δ, ξ_PLL, i_d, i_q. The full LCL GFL retains 15 states.','教学模型四状态：δ、ξ_PLL、i_d、i_q；完整 LCL GFL 保留 15 状态。'));d.save()

def droop(lang):
    d=Drawing('droop-control',lang,tr(lang,'Power mismatch changes frequency, angle and electrical power','功率偏差依次改变频率、角度和电气功率'),h=485)
    xs=[35,290,545,800];ws=205;y=104
    titles=[tr(lang,'P–frequency droop','P–频率下垂'),tr(lang,'Angle integration','角度积分'),tr(lang,'Voltage source','内部电压源'),tr(lang,'Shared network','网络约束')]
    subs=['ω = 1 + m_p(P* − P_f)','δ̇ = ω_b(ω − ω_g)','U = E exp(jδ)','P + jQ = V I*']
    for x,title,sub in zip(xs,titles,subs):d.block(x,y,ws,96,title,sub,BLUE)
    for a,b in zip(xs,xs[1:]):d.line(a+ws,y+47,b-7,y+47,color=BLUE,arrow=True)
    d.block(291,305,253,94,tr(lang,'Power measurement filter','功率测量滤波'),'τ_p Ṗ_f = P − P_f',TEAL)
    d.path('M903 207 V352 H551',TEAL,2,True);d.path('M291 352 H140 V207',TEAL,2,True)
    d.text(670,340,tr(lang,'PCC power feedback','PCC 功率反馈'),18,TEAL,'middle')
    d.text(615,273,'Q_f → E = E₀ − n_q(Q_f − Q*)',19,GOLD)
    d.path('M666 280 V207',GOLD,2,True)
    d.footer(tr(lang,'Teaching source is algebraic. A physical realization adds voltage PI → current PI → LCL.','教学电压源为代数实现；物理实现还包含电压 PI → 电流 PI → LCL。'));d.save()

def vsm(lang):
    d=Drawing('vsm-mechanism',lang,tr(lang,'The same steady slope, a different frequency state','相同稳态斜率，不同频率动态'),h=455)
    d.text(35,53,tr(lang,'ALGEBRAIC DROOP','代数式下垂'),18,BLUE,weight=600)
    d.block(35,88,270,94,'P* − P_f',tr(lang,'filtered mismatch','滤波后的功率偏差'))
    d.block(410,88,315,94,'1 + m_p(·)',tr(lang,'instantaneous frequency law','瞬时频率规律'))
    d.line(305,135,400,135,color=BLUE,arrow=True);d.line(725,135,941,135,color=BLUE,arrow=True);d.text(965,142,'ω',25,BLUE)
    d.text(35,245,tr(lang,'VIRTUAL SYNCHRONOUS MACHINE','虚拟同步机'),18,TEAL,weight=600)
    d.block(35,275,270,94,'P* − P_f − D(ω − 1)',tr(lang,'accelerating power','加速功率'),TEAL)
    d.block(410,275,315,94,'1 / (M s)',tr(lang,'frequency becomes a state','频率成为独立状态'),TEAL)
    d.line(305,322,400,322,color=TEAL,arrow=True);d.line(725,322,941,322,color=TEAL,arrow=True);d.text(965,329,'ω',25,TEAL)
    d.footer(tr(lang,'D = 1/m_p matches the steady slope; M changes the initial RoCoF.','D = 1/m_p 保持相同稳态斜率；M 改变初始频率变化率。'));d.save()

def parallel(lang):
    d=Drawing('parallel-pcc',lang,tr(lang,'Two active branches, one physical PCC','两个同时工作的支路，同一个物理 PCC'),h=480)
    d.block(42,76,215,95,'GFL',tr(lang,'current branch · 4 states','电流支路 · 4 状态'),BLUE)
    d.line(257,124,567,124,color=BLUE,arrow=True);d.text(417,104,'I_c',21,BLUE)
    d.block(42,251,215,95,'Droop GFM',tr(lang,'voltage branch · 3 states','电压支路 · 3 状态'),TEAL)
    d.line(257,298,355,298,color=TEAL);d.block(355,264,112,68,'Z_f','',TEAL);d.line(467,298,567,298,color=TEAL,arrow=True)
    d.line(580,96,580,330,width=5);d.text(580,63,'PCC · V',23,INK,'middle',600)
    d.line(580,205,690,205,color=INK,arrow=True);d.block(690,165,116,79,'Z_g','',INK);d.line(806,205,915,205,color=INK);d.circle(946,205,30);d.text(946,215,'~',29,INK,'middle');d.text(946,270,'V_g',22,INK,'middle')
    d.text(610,141,'I_g = I_c + I_v',21,INK)
    d.path('M580 330 V375 H148 V354',GOLD,2,True);d.path('M580 124 V33 H148 V68',GOLD,2,True)
    d.text(336,405,tr(lang,'Both branches receive the same physical voltage.','两个支路使用相同的物理端口电压。'),18,GOLD,'middle')
    d.footer(tr(lang,'P_total = P_GFL + P_GFM. All quantities use one common system base.','P_total = P_GFL + P_GFM；所有量使用共同系统基值。'));d.save()

def switching(lang):
    d=Drawing('switching-reset',lang,tr(lang,'A transition is a reset map between distinct state meanings','切换是不同状态含义之间的重置映射'),h=475)
    d.block(35,78,315,120,'GFL','[δ_PLL, ξ_PLL, i_d, i_q]',BLUE)
    d.block(690,78,315,120,'VSM','[δ_source, ω, P_f, Q_f]',TEAL)
    d.line(350,138,681,138,color=GOLD,arrow=True);d.text(520,110,'R(x⁻, u)',22,GOLD,'middle',600)
    d.rect(232,258,575,132,'#f5f8f8',LINE)
    d.text(520,294,tr(lang,'Match the terminal before copying numbers','先匹配端口，再初始化新状态'),22,INK,'middle',600)
    d.text(520,330,'U⁺ = V⁻ + Z_f I⁻',25,TEAL,'middle')
    d.text(520,364,'ω⁺ = ω⁻    P_f⁺ = P⁻    Q_f⁺ = Q⁻',21,INK,'middle')
    d.path('M191 198 V325 H221',BLUE,2,True);d.path('M818 325 H848 V208',TEAL,2,True)
    d.footer(tr(lang,'The demonstrated reset also recalibrates P* and E₀; the terminal is continuous, the source angle need not be.','演示重置还校准 P*、E₀；端口量连续不要求内部源角度相等。'));d.save()

def comparison(lang):
    d=Drawing('comparison-protocol',lang,tr(lang,'A comparison requires a common operating point and protocol','比较需要共同运行点和一致的实验协议'),h=450)
    labels=[tr(lang,'Match the terminal','匹配端口'),tr(lang,'Verify equilibrium','核验平衡点'),tr(lang,'Apply one event','施加同一扰动'),tr(lang,'Compare outputs','比较共同输出')]
    sub=['P = 0.6, Q = 0','max |f(x₀,u₀)| ≈ 0','ΔP* = +0.03 @ 1 s','P, Q, |V|, frequency']
    for k,x in enumerate([35,292,549,806]):
        d.text(x,65,'0'+str(k+1),18,[BLUE,TEAL,GOLD,BLUE][k],weight=600)
        d.block(x,100,200,112,labels[k],sub[k],[BLUE,TEAL,GOLD,BLUE][k])
        if k<3:d.line(x+200,156,x+250,156,color=MUTED,arrow=True)
    d.rect(35,272,970,103,'#f5f8f8',LINE)
    d.text(520,313,tr(lang,'Same terminal target ≠ same controller command','相同端口目标 ≠ 相同原始控制指令'),25,INK,'middle',600)
    d.text(520,349,tr(lang,'Record model order, ports, gains, event and numerical accuracy.','同时记录阶次、端口、增益、扰动和数值精度。'),20,MUTED,'middle')
    d.footer(tr(lang,'Equation consistency → approximation validity → external validation are distinct evidence levels.','方程一致性、近似有效性、外部验证属于不同的证据层级。'));d.save()

def curve(lang,name,case,keys,title,unit='pu',labels=None,increments=False):
    r=m.solve(case);d=Drawing(name,lang,title,h=445)
    d.text(35,42,title,24,INK,weight=600)
    selected=[r['traces'][key] for key in keys]
    if increments:selected=[[v-values[0] for v in values] for values in selected]
    allv=[x for a in selected for x in a]
    lo,hi=min(allv),max(allv);pad=max((hi-lo)*.13,.001);lo-=pad;hi+=pad
    x0,x1,y0,y1=91,995,93,335;tend=r['time'][-1]
    X=lambda t:x0+(x1-x0)*t/tend
    Y=lambda v:y1-(y1-y0)*(v-lo)/(hi-lo)
    for k in range(5):
        v=lo+k*(hi-lo)/4;y=Y(v);d.line(x0,y,x1,y,color=LINE,width=1);d.text(x0-12,y+5,f'{v:.4f}' if unit!='Hz' else f'{v:.3f}',17,MUTED,'end')
        t=k*tend/4;d.text(X(t),366,f'{t:g}',17,MUTED,'middle')
    d.text(91,76,unit,17,MUTED);d.text(995,366,'t / s',17,MUTED,'end')
    events=[] if r['mode']=='frame' else [.01] if r['mode']=='lcl' else [1,2] if r['mode']=='switch' else [1]
    for t in events:
        d.line(X(t),y0,X(t),y1,color=MUTED,dash=True,width=1.5)
        d.text(X(t)+9,84,tr(lang,'switch' if t==2 else 'event','切换' if t==2 else '扰动'),17,MUTED)
    for index,(key,values) in enumerate(zip(keys,selected)):
        color=[BLUE,GOLD,TEAL,'#8a6499'][index]
        d.path(' '.join(('M' if i==0 else 'L')+f'{X(t):.3f} {Y(v):.3f}' for i,(t,v) in enumerate(zip(r['time'],values))),color,2.8)
        x=100+index*222;d.line(x,399,x+30,399,color=color,width=3);d.text(x+40,405,labels[index] if labels else key,18,INK)
    d.save(r['case'])

def hero(lang):
    d=Drawing('course-map',lang,tr(lang,'A learning path from physics to model judgment','从物理电路走向模型判断的学习路径'),w=520,h=485)
    d.text(30,47,'IBR / DYNAMICS',18,BLUE,weight=600)
    d.line(85,147,445,147,color=INK,width=2)
    d.rect(45,112,92,72,'#f0f5f7',BLUE);d.text(91,156,'VSC',24,BLUE,'middle',600)
    d.coil(168,147,53);d.text(194,110,'L₁',19,INK,'middle')
    d.node(274,147);d.line(274,147,274,201);d.line(259,201,289,201,width=3);d.line(259,211,289,211,width=3);d.line(274,211,274,238);d.text(299,211,'C',19,TEAL)
    d.coil(323,147,53);d.text(351,110,'L₂',19,INK,'middle');d.circle(454,147,22);d.text(454,155,'~',24,INK,'middle');d.text(454,200,tr(lang,'grid','电网'),16,MUTED,'middle')
    d.rect(31,280,140,112,'#f0f5f7',BLUE);d.rect(190,280,140,112,'#f0f6f3',TEAL);d.rect(349,280,140,112,'#fbf5ee',GOLD)
    for x,title,sub,c in [(101,'GFL',tr(lang,'follow the angle','跟踪电压角度'),BLUE),(260,'GFM',tr(lang,'form the voltage','建立电压与角度'),TEAL),(419,'HYBRID',tr(lang,'couple / switch','并联 / 模式切换'),GOLD)]:d.text(x,321,title,24,c,'middle',600);d.text(x,357,sub,16,MUTED,'middle')
    d.path('M91 184 V242 H419 V272',GOLD,1.8,True);d.path('M260 242 V272',TEAL,1.8,True);d.path('M101 242 V272',BLUE,1.8,True)
    d.text(260,449,tr(lang,'One plant. Different retained dynamics.','同一物理电路，不同动态表示。'),20,INK,'middle')
    d.save()

for lang in ('en','zh'):
    for make in (hero,fidelity,frames,circuit,gfl,droop,vsm,parallel,switching,comparison): make(lang)
    curve(lang,'frame-response',{'mode':'frame'},['vd','vq','p','q'],tr(lang,'A 20° coordinate change preserves P and Q','20° 坐标偏差不改变 P、Q'),labels=['v_d','v_q','P','Q'])
    curve(lang,'lcl-response',{'mode':'lcl'},['i2d','vcd','vcq'],tr(lang,'A voltage command excites the electrical plant','电压指令激发电气电路暂态'),labels=['i₂d','v_cd','v_cq'])
    curve(lang,'gfl-response',{'mode':'gfl','event':'f','step':.1},['frequency'],tr(lang,'PLL tracks a +0.1 Hz grid-frequency step','PLL 跟踪 +0.1 Hz 电网频率阶跃'),'Hz',labels=[tr(lang,'PLL frequency','PLL 估计频率')])
    curve(lang,'droop-response',{'mode':'droop'},['p'],tr(lang,'Power changes after the angle begins to move','角度开始变化后，电气功率才跟上'),labels=[tr(lang,'PCC active power','PCC 有功功率')])
    curve(lang,'vsm-response',{'mode':'compare'},['droop','vsm'],tr(lang,'An added frequency state changes the transient','增加频率状态，改变暂态轨迹'),labels=['Droop','VSM'])
    curve(lang,'parallel-response',{'mode':'parallel'},['p_gfl','p_gfm','p'],tr(lang,'Branch power increments still add to the total','支路功率增量仍满足总量求和'),'ΔP / pu',labels=['ΔP GFL','ΔP GFM',tr(lang,'ΔP total','ΔP 总功率')],increments=True)
    curve(lang,'switch-response',{'mode':'switch'},['p'],tr(lang,'At 2 s, the explicit reset preserves terminal power','2 s 显式重置保持端口功率连续'),labels=[tr(lang,'PCC active power','PCC 有功功率')])
    curve(lang,'comparison-response',{'mode':'compare'},['gfl','droop','vsm','parallel'],tr(lang,'Matched terminal point; different transient trajectories','端口运行点相同，暂态轨迹仍然不同'),labels=['GFL','Droop','VSM','Parallel'])
(ROOT/'_data/ibr_modeling_figures.json').write_text(json.dumps(MANIFEST,ensure_ascii=False,indent=2)+'\n')
print(f'Generated {len(MANIFEST)*2} bilingual SVG figures; response plots use the teaching solver.')
