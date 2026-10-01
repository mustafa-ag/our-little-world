# Rain v3.3 — Topology & Construction Notes
(Reference only — Juju design must be original)

Source: Blender Studio — https://studio.blender.org/characters/rain/v3/
License: CC0 1.0 Universal
Blend file inspected: rain_v3.2.blend (packaged as Rain.v3.3.zip)

---

## Mesh Objects

| Object | Type | Verts | Faces | Notes |
|--------|------|-------|-------|-------|
| GEO-rain-head | MESH | 6395 | 6318 | Separate head mesh |
| GEO-rain-body | MESH | 10256 | 10232 | Body with mask modifier |
| GEO-rain-body_nomask | MESH | 10256 | 10232 | Body without mask (rig helper) |
| GEO-rain-eyes | MESH | 1418 | 1410 | Main eye surface |
| GEO-rain-eye_cornea | MESH | 642 | 672 | Cornea overlay |
| GEO-rain-eye_dots | MESH | 32 | 1 | Pupil/iris dots |
| GEO-rain-eyebrows | MESH | 148 | 130 | Separate eyebrow strips |
| GEO-rain-eyelashes | MESH | 120 | 118 | Separate lash strips |
| GEO-rain-gums_lower | MESH | 1542 | 1440 | Lower gum + teeth |
| GEO-rain-gums_upper | MESH | 1542 | 1440 | Upper gum + teeth |
| GEO-rain-tongue | MESH | 275 | 264 | Tongue |
| GEO-rain-hair_main | MESH | 2204 | 1965 | Main hair cap |
| GEO-rain-hair_ponytail | MESH | 579 | 569 | Ponytail clump |
| GEO-rain-hair_strand | MESH | 400 | 393 | Loose strand clump |
| GEO-rain-hairband | MESH | 480 | 480 | Hair accessory |
| GEO-rain-top | MESH | 1632 | 1556 | Shirt/top garment |
| GEO-rain-jeans | MESH | 4531 | 4464 | Trousers |
| GEO-rain-scarf | MESH | 1285 | 1217 | Scarf accessory |
| GEO-rain-shoes | MESH | 6634 | 6254 | Footwear (both feet) |
| RIG-rain | ARMATURE | — | — | 2166 bones (CloudRig) |

## Collections Structure

- **CH-rain** (parent)
  - **rain-body**: head, body, gums, tongue, eyebrows, eyelashes
  - **rain-eyes**: eyes, cornea, dots
  - **rain-hair**: hair_main, ponytail, strand, hairband
  - **rain-clothes**: top, jeans, scarf, shoes
  - **rain-rig**: armature
  - **rain-rig-helpers**: lattice, nomask body

## Vertex Counts

- Head: 6395 verts / 6318 faces (dense facial topology)
- Body: 10256 verts / 10232 faces (full torso + limbs)
- Eyes: ~2100 combined (3 separate objects: main, cornea, dots)
- Hair: ~3260 verts across 3 objects (main cap + clumps)
- Clothing: ~14000 verts total across top, jeans, scarf, shoes

## Shape Keys (face expressions — GEO-rain-head)

Basis, mouth_open, LipsAdjust, LipsWide.L, LipsWide.R, LipsUp.L, LipsUp.R,
Smile.L, Smile.R, CheekPuff.L, CheekPuff.R, LipsPuff_Upper, LipsPuff_Lower,
EyebrowsTogether.L/R, EyebrowsDown.L/R, EyelidsClose.L/R,
Lips_Corner_In.L/R, Head_Back, Head_Forward

## Shape Keys (body deformation — GEO-rain-body)

Joint correction shapes: Elbow1/2, Wrist (XZ_Wrist_Down/Up/Fwd/Back),
Spine_Fwd/Back, Ribcage_Fwd/Back, Chest_Fwd/Back,
Thigh_Fwd/Back/Side, Ankle_Down/Up/In/Out,
FingerBends1/2/3, Finger_Index/Middle/Ring/Pinky/Thumb (1-3, L+R)
Shoulder_Down.L/R

## Vertex Groups / Deform Zones

Primary deform bones (DEF- prefix): Head, Neck, Spine1-4, Pelvis, Clavicle.L/R,
Upperarm1/2.L/R, Forearm1/2.L/R, Hand, Thigh1/2.L/R, Shin1/2.L/R, Foot.L/R, Toe.L/R

Corrective bones (COR- prefix): Shin_Bot/Top/Cap, Thigh_Back, Hip zones,
Ankle zones, Upperarm zones, Forearm zones, Clavicle zones

## UV Layers

All character meshes: single 'UVMap' layer
Hair meshes: 'UVMap' + 'UVMap.tangent' (anisotropic shading)

## Modifier Stack

All character meshes follow this pattern:
1. Optional: VERTEX_WEIGHT_MIX (for masking overlap zones)
2. Optional: MASK (hide geometry hidden by clothing)
3. ARMATURE
4. Optional: CORRECTIVE_SMOOTH
5. Optional: SOLIDIFY (clothing only, for thickness)
6. SUBSURF (levels=2 for viewport, higher for render)

Eye/hair meshes also use: LATTICE (Lattice_Head_Main) for secondary animation, MIRROR (for bilateral symmetry)

## Materials / Slots

- MAT-rain.body — skin for body/head
- MAT-rain.hands — separate skin material for hands
- MAT-rain.eyes — iris/sclera
- MAT-rain.cornea — wet surface over eye
- MAT-rain.eyedot — pupil dot
- MAT-rain.eyebrows — eyebrow card
- MAT-rain.eyelashes — lash card
- MAT-rain.gums — gum tissue
- MAT-rain.teeth — tooth enamel
- MAT-rain.tongue — tongue tissue
- MAT-rain.hair — hair strands (all hair objects share this)
- MAT-rain.hairband — accessory rubber band
- MAT-rain.top — shirt fabric
- MAT-rain.jeans — denim
- MAT-rain.scarf — scarf fabric
- MAT-rain.shoes — shoe upper
- MAT-rain.metal — shoe eyelets/lace hooks
- MAT-rain.socks — socks at top of shoe
- MAT-rain.laces — shoe laces

## Armature / Bone Structure

Total: 2166 bones (CloudRig procedural rig)
Main bone prefixes:
- DEF- : actual deform bones (drive mesh)
- COR- : corrective helpers (fix volume loss at joints)
- BB- : bend bones (segment subdivision for smooth arcs)
- TAN- : tangent/twist helpers
- WGT- : widget display shapes (visual only)

Key bones: Head, Neck, Spine1-4, Pelvis, Clavicle.L/R, Upperarm1/2.L/R,
Forearm1/2.L/R, Hand.L/R, Thigh1/2.L/R, Shin1/2.L/R, Foot.L/R, Toe.L/R
Face bones: Eye.L/R, Eyelid_Top 1-3.L/R, Eyebrow bones, Nose bones,
Cheek bones, Lip/Mouth bones, Jaw, Teeth (top+bottom), Tongue1/2

## Key Topology Observations

- **Eye socket construction**: Eye sphere sits inside a concave socket ring; eyelids are separate mesh objects (not part of head) using Armature+Lattice deformers; cornea is an additional near-transparent layer. Eyes use Mirror modifier (one half modeled, mirrored).
- **Mouth loop**: Dense ring of edge loops forms the mouth cavity; lips are sculpted into head mesh; separate tooth/gum meshes float inside. Shape key 'mouth_open' on head + gums creates a believable open-mouth.
- **Head-to-neck transition**: Head is a completely separate mesh from the body; they meet at the neck ring but are not connected. Each has Armature + CorrectiveSmooth.
- **Hand topology**: Hands are part of the body mesh but have a separate MAT-rain.hands material slot. Finger knuckle loops and FingerBends shape keys handle finger curling.
- **Hair construction**: Three separate objects: (1) main cap hugging skull, (2) ponytail clump with chain bones, (3) loose strand with 2-3 deform bones. Hair objects use an additional UVMap.tangent for anisotropic shading.
- **Clothing layers**: Clothing is completely separate from skin. Top/jeans have a SOLIDIFY modifier for thickness. Mask modifier on body hides skin geometry where clothing covers it, preventing Z-fighting.

## What to APPLY to Juju (technique only, not design)

- Separate mesh objects: skin body+head, eyes (ball + cornea), eyebrows (card), hair (cap + clump objects), clothing layer 1 (top), clothing layer 2 (pants), shoes
- Subdivision Surface on every mesh (SubSurf levels=2, modeled at base cage)
- MIRROR modifier for bilateral symmetry during modeling (apply before export)
- Distinct joint edge loops at elbow, wrist, knee, ankle, shoulder
- Eye socket as a concave ring in head mesh, eyeball sphere inside
- Mouth oval loop in head mesh
- Dense forehead/cheek topology tapering toward crown
- Hair as 2-3 separate clump meshes with vertex groups per bone
- Clothing with SOLIDIFY for realistic thickness
- Material separation by surface type (skin / eyes / hair / fabric / shoe)

## What is RAIN-SPECIFIC (do not copy)

- Rain's face shape (narrow chin, specific nose bridge, cheekbone width)
- Rain's eye style (specific iris color, exact eyelid droop)
- Rain's hair style: top-knot with loose ponytail + strand at temple
- Rain's skin tone and freckle pattern
- Rain's clothing: turtleneck top, wide-leg jeans, platform sneakers with laces, scarf
- Rain's color palette: blue top, indigo jeans, pink scarf, white/tan shoes
- Rain's proportions: adult body, ~7 heads tall
- The CloudRig 2166-bone setup
- Any texture data or material node setups
