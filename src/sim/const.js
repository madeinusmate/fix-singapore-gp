export const ASSUME = {
  mass_kg: 800,
  P_ice_kW: 400,
  P_k_max_kW: 350,
  a_lat_g: 3.5,
  a_brake_g: 4.5,
  a_trac_g: 1.3,
  rho: 1.18,
  CdA_Z: 1.25,
  CdA_X: 0.9,
  Crr: 0.015,
  harvest_cap_MJ: 8.5,
  overtake_extra_MJ: 0.5,
  regen_max_kW: 350,
  xmode_min_s: 3,
  xmode_min_radius_m: 300,
  RMIN_m: 12,
}

export const G0 = 9.81

// Start-line used to rotate every lap so distance zero is the same place.
export const START_LL = [103.8642, 1.29]
// South-of-start and north anchors for the grid slice. Same points as the Python lab.
export const GRID_A_LL = [103.8644, 1.2893]
export const GRID_B_LL = [103.86384, 1.29345]

export const SIM_VERSION = 2
export const MIN_LAP_M = 3500
export const MAX_LAP_M = 7000
export const MAX_WAYPOINTS = 60
