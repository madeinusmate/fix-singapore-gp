# Marina Bay layouts

A public study of how the Marina Bay street circuit could be run differently to create more overtaking under the 2026 regulations. Anyone can propose a lap. The starting grid stays where it is.

## Language

**Layout**:
A closed lap of Marina Bay streets that includes the starting grid.
_Avoid_: Redesign, design, track

**Current layout**:
The reconstructed circuit as raced today. It is not a user layout.
_Avoid_: Official layout, base layout

**Starting grid**:
The fixed start/finish straight on Republic Boulevard by the Pit Building. Same geometry on every layout. The pit lane is not part of the lap.
_Avoid_: Grid boxes, pit straight, start line

**Racing sense**:
Clockwise or anticlockwise traversal of a layout. It is chosen by the creator and stored on the layout. The default is anticlockwise, matching the real race. Flipping it swaps which end of the starting grid the lap leaves from.
_Avoid_: Direction, orientation

**Waypoint**:
An ordered point a layout must pass through. The lap between waypoints follows the streets. A waypoint the lap could only reach with a U-turn is skipped and shown hollow.
_Avoid_: Node, pin, control point

**Route home**:
The stretch from the last waypoint back to the starting grid. It is routed automatically, avoids roads the lap already drives where it can, and is drawn dashed in the editor.
_Avoid_: Closing leg, auto-close

**Valid lap**:
A layout that is closed, never drives the same road twice in either direction, does not cross itself where both roads are at the same level, and is between 3.5 km and 7 km long.
_Avoid_: Legal layout, feasible layout

**Draft**:
A layout that exists only in the browser where it was drawn.
_Avoid_: Sketch, unsaved layout

**Published layout**:
A layout listed on the leaderboard and reachable by a public URL.
_Avoid_: Shared layout, live layout

**Upvote**:
One Google account's vote for a published layout. An account has at most one upvote per layout and can withdraw it. Voting needs sign-in.
_Avoid_: Like, star

**Leaderboard**:
The homepage list of published layouts, most upvotes first and newest first among ties. Its heading on the site is "The grid".
_Avoid_: Gallery, feed

**Creator**:
The Google account that published a layout. Only the creator can edit or delete it.
_Avoid_: Author, owner, user
