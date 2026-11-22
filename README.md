# TMC Excited-State Predictor

Interactive companion to **Graph Neural Networks for Accelerated Prediction of Excited-State Properties in Transition-Metal Complexes**, Ismael A. Elayan, J. Diego Castro-Miyashiro and J. Terence Blaskovits. [Preprint](https://doi.org/10.26434/chemrxiv.15008673/v1).

This static website retains the layout, molecular renderer, spectrum controls and tables of Ismael's reviewed GUI. It sends XYZ coordinates and an explicit molecular charge to the existing hosted Hugging Face API. It contains no model weights, authentication tokens or Python backend. The solution-color estimate has been removed.

## Use

Load an XYZ file or the supplied example, choose DFT or GFN2-xTB according to the geometry you actually supplied, choose the total charge, then click **Predict**. The first request after inactivity may take a few minutes. The service predicts gas-phase and acetone properties; selecting xTB does not optimize a geometry. The example is a DFT geometry.

Both model options use five members. There is no baseline. The 30 state energies, oscillator strengths and calibrated standard deviations come directly from the API. Regional CT/NTO output is gated by predicted visible-band presence. An optional spectral envelope illustrates independent Gaussian perturbations of state energies; it is not a calibrated spectral confidence interval. No OOD percentile is invented when the API does not supply a reference distribution.

## Local preview and backend changes

With Python installed, run `python -m http.server 8080` from this folder, then open `http://localhost:8080`. Predictions still run remotely. Edit `config.js` to switch to another compatible API later; the website address can remain unchanged. The backend must allow the website's origin through CORS. Never put an API key in this repository or browser JavaScript.

The maintained source is the private API project's `frontend-lab/` folder. `scripts/build_lab_frontend.py` adapts the preserved November 2 reviewed GUI; its original source is not modified. `adapter.js` translates the API response for the GUI, without changing scientific predictions. Public publication uses a static-only file allowlist. The personal-account website remains a separate deployment.

Original GUI copyright 2026 Ismael Elayan, MIT license; see LICENSE. This interface serves reviewed models and is not a new scientific validation.
