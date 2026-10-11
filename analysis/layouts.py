R='raceway'; SA="Saint Andrew's Road"
GRID=[(103.86397,1.28868,{R}),(103.86384,1.29345,{R})]   # grid / pit straight: unchanged in every design
T1=[(103.86239,1.29454,{R})]
CURRENT=GRID+T1+[
 (103.862347,1.2912552,{R,'Republic Boulevard'}),
 (103.8559769,1.2930831,{'Raffles Boulevard'}),
 (103.8548655,1.2914505,{'Nicoll Highway'}),
 (103.8536185,1.2926038,{'Stamford Road'}),
 (103.8515745,1.2893739,{SA}),
 (103.85241,1.28834,{'Connaught Drive'}),
 (103.85376,1.28661,'LINK'),   # Anderson Bridge (not in fetched OSM road set) -> straight link
 (103.85468,1.2904,{'Esplanade Drive','Fullerton Road','',R}),
 (103.8559972,1.2904752,'LINK'),  # T14 slip Esplanade Dr -> Raffles Ave (only partly tagged raceway in OSM)
 (103.86108,1.28955,{'Raffles Avenue',R}),
 (103.86397,1.28868,{R}),
]
COMMON_TO_NICOLL=GRID+T1+[
 (103.862347,1.2912552,{R,'Republic Boulevard'}),
 (103.8559769,1.2930831,{'Raffles Boulevard'}),
 (103.8548655,1.2914505,{'Nicoll Highway'}),
 (103.8550077,1.291324,{'Nicoll Highway','Raffles Avenue','Stamford Road','Esplanade Drive'}),
]
# Design A: real roads only - Bayfront Ave south to Marina Blvd, back north on Sheares Ave
DESIGN_A=COMMON_TO_NICOLL+[
 (103.86099,1.28956,{'Raffles Avenue','Bayfront Avenue'}),
 (103.8571,1.27889,{'Bayfront Avenue'}),
 (103.85838,1.27806,{'Marina Boulevard','Bayfront Avenue','Sheares Avenue'}),
 (103.86148,1.288,{'Sheares Avenue'}),
 (103.86194,1.28879,'LINK'),   # Sheares Ave north end -> existing circuit section (short temporary link)
 (103.86397,1.28868,{R}),
]
# Design B: shorter Bayfront loop with a flagged temporary cross-over link at ~1.2833N
DESIGN_B=COMMON_TO_NICOLL+[
 (103.86099,1.28956,{'Raffles Avenue','Bayfront Avenue'}),
 (103.86003,1.28360,{'Bayfront Avenue'}),
 (103.86107,1.28305,'LINK'),   # temporary hairpin cross-over Bayfront Ave -> Sheares Ave
 (103.86148,1.288,{'Sheares Avenue'}),
 (103.86194,1.28879,'LINK'),
 (103.86397,1.28868,{R}),
]
DESIGN_A=GRID+T1+[
 (103.8630284,1.2910803,{R,'Republic Boulevard'}),
 (103.86099,1.28956,{'Raffles Avenue','Bayfront Avenue'}),
 (103.8571,1.27889,{'Bayfront Avenue'}),
 (103.85838,1.27806,{'Marina Boulevard','Bayfront Avenue','Sheares Avenue'}),
 (103.86148,1.288,{'Sheares Avenue'}),
 (103.86194,1.28879,'LINK'),
 (103.86397,1.28868,{R}),
]


# Esplanade Dr / Fullerton Rd / Collyer Quay are dual carriageways. Singapore drives on the left, so the
# EAST carriageway carries southbound traffic. To avoid the track crossing itself at the north end
# (return leg must turn EAST onto Raffles Ave), the race runs SOUTH on the WEST carriageway and NORTH on the EAST one.
CQ={'Collyer Quay','Fullerton Road','Esplanade Drive','Nicoll Highway'}
W=lambda pts:[(a,b,CQ) for a,b in pts]
WEST_SB_ESPL=W([(103.85487,1.29145),(103.85455,1.29052),(103.85427,1.28926),(103.85402,1.28798),(103.85378,1.2867)])
WEST_SB_FULL=W([(103.85371,1.28639),(103.85353,1.28579),(103.85327,1.28516),(103.85291,1.28438),(103.85268,1.28376),(103.85247,1.28319)])
WEST_SB_COLL=W([(103.85229,1.28294),(103.85205,1.28275),(103.85175,1.28262)])
EAST_NB_COLL=W([(103.85231,1.2826),(103.85248,1.28286)])
EAST_NB=W([(103.85273,1.28331),(103.85293,1.28388),(103.8536,1.28548),(103.85387,1.28631),(103.85415,1.28779),(103.85437,1.28893),(103.85451,1.28963)])+[(103.85468,1.2904,CQ|{R})]
FINISH=[(103.8559972,1.2904752,'LINK'),(103.86108,1.28955,{'Raffles Avenue',R}),(103.86397,1.28868,{R})]
DESIGN_A2=GRID+T1+[
 (103.862347,1.2912552,{R,'Republic Boulevard'}),
 (103.8559769,1.2930831,{'Raffles Boulevard'}),
 (103.8548655,1.2914505,{'Nicoll Highway'}),
]+WEST_SB_ESPL+WEST_SB_FULL+WEST_SB_COLL+[(103.85198,1.282188,'LINK')]+EAST_NB_COLL+EAST_NB+FINISH
DESIGN_B2=CURRENT[:9]+[(103.85376,1.28661,'LINK')]+WEST_SB_FULL+[(103.85273,1.28331,'LINK')]+EAST_NB+FINISH
