"""L05: cosine-reference RMS phasors, compatible voltage addition, and waveforms.

The two voltages share angular frequency, voltage units, RMS convention, and
angle reference. Current is compared by phase only; it is never added to voltage.
Only Python's standard library is needed. All angles in case are in degrees.
"""
import cmath
import math

DEFAULTS = dict(vs_rms=120.0, vs_angle_deg=30.0, vx_rms=40.0,
                vx_angle_deg=-60.0, omega=377.0, current_angle_deg=-20.0)


def wrap(degrees):
    return (degrees + 180.0) % 360.0 - 180.0


def describe(value, tolerance=0.0):
    magnitude = abs(value)
    if magnitude <= tolerance:
        return dict(re=0.0, im=0.0, rms=0.0, peak=0.0, angle_deg=None)
    return dict(re=value.real, im=value.imag, rms=magnitude,
                peak=math.sqrt(2.0) * magnitude,
                angle_deg=wrap(math.degrees(cmath.phase(value))))


def solve(case):
    p = dict(DEFAULTS, **case)
    for key in DEFAULTS:
        if isinstance(p[key], bool) or not isinstance(p[key], (int, float)) or not math.isfinite(p[key]):
            raise ValueError(key + " must be a finite number")
    if p["vs_rms"] < 0 or p["vx_rms"] < 0:
        raise ValueError("RMS magnitudes must be nonnegative")
    if p["omega"] <= 0:
        raise ValueError("Angular frequency must be positive")

    # Convert to complex rectangular components before adding.
    vs = cmath.rect(p["vs_rms"], math.radians(p["vs_angle_deg"]))
    vx = cmath.rect(p["vx_rms"], math.radians(p["vx_angle_deg"]))
    total = describe(vs + vx, 1e-12 * max(1.0, p["vs_rms"] + p["vx_rms"]))
    period = 2.0 * math.pi / p["omega"]
    n = 480
    wave = {name: [] for name in ("t_ms", "vs_v", "vx_v", "total_v",
                                  "reconstructed_v", "v_normalized", "i_normalized")}
    for i in range(n + 1):
        t = 2.0 * period * i / n
        a = math.sqrt(2.0) * p["vs_rms"] * math.cos(p["omega"] * t + math.radians(p["vs_angle_deg"]))
        b = math.sqrt(2.0) * p["vx_rms"] * math.cos(p["omega"] * t + math.radians(p["vx_angle_deg"]))
        reconstructed = (0.0 if total["rms"] == 0 else
                         total["peak"] * math.cos(p["omega"] * t + math.radians(total["angle_deg"])))
        wave["t_ms"].append(1000.0 * t)
        wave["vs_v"].append(a)
        wave["vx_v"].append(b)
        wave["total_v"].append(a + b)
        wave["reconstructed_v"].append(reconstructed)
        wave["v_normalized"].append(0.0 if p["vs_rms"] == 0 else math.cos(p["omega"] * t + math.radians(p["vs_angle_deg"])))
        wave["i_normalized"].append(math.cos(p["omega"] * t + math.radians(p["current_angle_deg"])))
    return dict(parameters=p, vs=describe(vs), vx=describe(vx), total=total,
                frequency_hz=p["omega"] / (2.0 * math.pi), period_ms=period * 1000.0,
                phase_difference_deg=None if p["vs_rms"] == 0 else wrap(p["vs_angle_deg"] - p["current_angle_deg"]),
                numerical_rms=math.sqrt(sum(x*x for x in wave["total_v"][:-1]) / n),
                reconstruction_error_max=max(abs(x-y) for x,y in zip(wave["total_v"], wave["reconstructed_v"])),
                waveform=wave)
