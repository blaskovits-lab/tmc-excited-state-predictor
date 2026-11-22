// Translate the reviewed API schema into the original GUI's display schema.
// No re-calibration or alteration of state predictions occurs here.
export function adaptResponse(raw, xyz, filename) {
  const symbols = xyz.trim().split(/\r?\n/).slice(2).map(l => l.trim().split(/\s+/)[0]);
  const counts = {};
  for (const s of symbols) counts[s] = (counts[s] || 0) + 1;
  const elements = Object.keys(counts).sort();
  const periodic = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn'.split(' ');
  const d = {raw, warnings: raw.warnings.map(text => ({level:'warn',text})),
    molecule: {filename, formula:elements.map(s=>s+(counts[s]===1?'':counts[s])).join(''), n_atoms:raw.input.n_atoms, metal:periodic[raw.input.metal_atomic_number-1],charge:raw.input.charge,elements},
    model:{key:raw.model,name:raw.model_version,inputs:raw.geometry.training+' geometry and formal charge',reference:'DFT-geometry TD-DFT targets',note:'Five-member ensemble; no geometry optimization.',calibration:raw.ensemble.energy_uncertainty},
    ood:{percentile_vs_test:null}};
  for (const env of ['gasphase','acetone']) {
    const s=raw.solvents[env], v=s.visible_transition;
    if(s.states.length!==30)throw Error('API did not return 30 singlet states.');
    const peaks={};
    for(const [key,apiKey] of [['uv','uv'],['vis','visible'],['nir','nir']]){
      const b=s.bands[apiKey], p=b.peak;
      peaks[key]={exists:b.present,presence_probability:b.probability,E_max_eV:p?.energy_eV??null,lambda_max_nm:p?.wavelength_nm??null,f_max:p?.oscillator_strength??null,broadness_sigma:p?.source_width_proxy??null};
    }
    d[env]={E_eV:s.states.map(x=>x.energy_eV),E_std_eV:s.states.map(x=>x.energy_std_eV),lambda_nm:s.states.map(x=>x.wavelength_nm),f:s.states.map(x=>x.oscillator_strength),peaks,
      ct:{valid:!!v,top:v?.direct_label??null,probs:v?.direct_probabilities??{}},
      nto:{valid:!!v,M_frac_occ:v?.occupied_nto_metal_fraction??null,M_frac_virt:v?.virtual_nto_metal_fraction??null}};
  }
  const g=d.gasphase.peaks.vis,a=d.acetone.peaks.vis;
  const delta=g.exists&&a.exists?a.lambda_max_nm-g.lambda_max_nm:null;
  d.shift={lambda_delta_nm:delta,f_delta:delta===null?null:a.f_max-g.f_max,direction:delta===null?'undefined':delta>5?'red shift':delta< -5?'blue shift':'small shift'};
  return d;
}
