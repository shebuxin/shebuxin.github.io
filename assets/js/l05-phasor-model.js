(function (root, factory) {
  "use strict";
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.L05PhasorModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const defaults = Object.freeze({vs_rms:120, vs_angle_deg:30, vx_rms:40, vx_angle_deg:-60, omega:377, current_angle_deg:-20});
  const practice = Object.freeze({...defaults, vs_rms:80, vs_angle_deg:-25, vx_rms:60, vx_angle_deg:-70});
  const radians = degrees => degrees * Math.PI / 180;
  function wrap(degrees) { return ((degrees + 180) % 360 + 360) % 360 - 180; }
  function polar(re, im, tolerance = 0) {
    const magnitude = Math.hypot(re, im);
    if (magnitude <= tolerance) return {re:0, im:0, rms:0, peak:0, angle_deg:null};
    return {re, im, rms:magnitude, peak:Math.SQRT2*magnitude, angle_deg:wrap(Math.atan2(im,re)*180/Math.PI)};
  }
  function phasor(rms, angle) { return polar(rms*Math.cos(radians(angle)), rms*Math.sin(radians(angle))); }
  function solve(parameters = {}) {
    const p = {...defaults, ...parameters};
    Object.keys(defaults).forEach(key => {
      if (typeof p[key] !== "number" || !Number.isFinite(p[key])) throw new Error(key + " must be a finite number");
    });
    if (p.vs_rms < 0 || p.vx_rms < 0) throw new Error("RMS magnitudes must be nonnegative");
    if (p.omega <= 0) throw new Error("Angular frequency must be positive");
    const vs = phasor(p.vs_rms,p.vs_angle_deg), vx = phasor(p.vx_rms,p.vx_angle_deg);
    const total = polar(vs.re+vx.re,vs.im+vx.im,1e-12*Math.max(1,p.vs_rms+p.vx_rms));
    const period = 2*Math.PI/p.omega, n = 480;
    const t_ms=[], vs_v=[], vx_v=[], total_v=[], reconstructed_v=[], v_normalized=[], i_normalized=[];
    let squareSum=0, reconstructionError=0;
    for (let i=0;i<=n;i++) {
      const t=2*period*i/n;
      const a=Math.SQRT2*p.vs_rms*Math.cos(p.omega*t+radians(p.vs_angle_deg));
      const b=Math.SQRT2*p.vx_rms*Math.cos(p.omega*t+radians(p.vx_angle_deg));
      const sum=a+b;
      const reconstructed=total.rms===0?0:total.peak*Math.cos(p.omega*t+radians(total.angle_deg));
      t_ms.push(t*1000); vs_v.push(a); vx_v.push(b); total_v.push(sum); reconstructed_v.push(reconstructed);
      v_normalized.push(p.vs_rms===0?0:Math.cos(p.omega*t+radians(p.vs_angle_deg)));
      i_normalized.push(Math.cos(p.omega*t+radians(p.current_angle_deg)));
      if (i<n) squareSum+=sum*sum;
      reconstructionError=Math.max(reconstructionError,Math.abs(sum-reconstructed));
    }
    const phaseDifference=p.vs_rms===0?null:wrap(p.vs_angle_deg-p.current_angle_deg);
    return {parameters:p, vs, vx, total, frequency_hz:p.omega/(2*Math.PI), period_ms:period*1000,
      phase_difference_deg:phaseDifference,
      numerical_rms:Math.sqrt(squareSum/n), reconstruction_error_max:reconstructionError,
      waveform:{t_ms,vs_v,vx_v,total_v,reconstructed_v,v_normalized,i_normalized}};
  }
  return {defaults,practice,solve,wrap,phasor};
});
