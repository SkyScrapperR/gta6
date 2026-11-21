# SELARA BAY — Soundtrack

Every note is synthesized live with Web Audio: subtractive saws and squares, FM bells, Karplus-Strong
plucks, supersaw pads, noise drums and formant "vocal" chops, scheduled by a lookahead sequencer
(`game/js/audio/music/`). Songs are data files in `game/js/audio/music/songs/` (tempo, key, scale,
chord progressions, sections, drum patterns, arrangement and a written melody).

Master bus: generated-impulse convolution reverb, tempo-synced delay, compressor, ducking under dialogue
and explosions, and a car-radio EQ (band-limited in a car, muffled for a moment after you get out).

## Score

| Song | Tempo | Key | Mood | Use |
|---|---|---|---|---|
| Heat on the Coast | 104 | A minor | neon dusk, hopeful, driving | Title theme (8-bar hook, seamless loop), credits reprise, warm cutscene theme (Mama Lin) |
| Coastline Run (score mix) | 118 | G minor | pedal down | Dynamic chase music: pad, then bass, drums, arpeggio and lead fade in by star level |
| Orchid After Dark (score mix) | 100 | D dorian | velvet, dangerous | Dark cutscene theme (Viktor Raza) |

Stingers: mission passed, mission failed, FLATLINED, CUFFED, Orchid tag (`game/js/audio/sfx.js`).

## Radio (press R in a car)

Stations keep playing while you are away — tuning back in lands where the station is "live" — and a
synthesized jingle plays between songs.

### Selara Nights FM — synthwave
| Song | Tempo | Key | Mood |
|---|---|---|---|
| Neon Tide | 110 | E minor | night drive along the boardwalk |
| Coastline Run | 118 | G minor | pedal down, sun on the windscreen |
| Orchid After Dark | 100 | D dorian | velvet, dangerous, slow-burning |
| Midnight Merpati | 114 | F# minor | empty streets, warm engine hum |

### Ombak Lo-Fi — jazzy 7th/9th chords, swing, vinyl crackle
| Song | Tempo | Key | Mood |
|---|---|---|---|
| Rain on Kemuning | 78 | D dorian | rain on awnings, late coffee |
| Warung at 2AM | 84 | F major | noodles, neon flicker, quiet talk |
| Slow Waves | 72 | C major | low tide, sunrise, nowhere to be |

### Gamelan Wave — pelog/slendro-inspired FM bells and gongs over electronic beats
| Song | Tempo | Key / scale | Mood |
|---|---|---|---|
| Bukit Asri Sunrise | 112 | D pelog | mist over the hills, a city waking |
| Pier 9 | 120 | C slendro | cranes, containers, distant horns |
| Kecak Circuit | 124 | B pelog | firelight chant meets drum machine (formant-noise vocal chops) |

Each song runs 1.5–2.5 minutes with intro, verses, lifting choruses (drop with a crash, noise riser
before), a bridge, drum fills on section ends and an outro.

## Sound effects and ambience

Engine with RPM and gear shifts, tyre screech, crashes scaled by impact, horn, each gunshot type,
reloads, punches, explosions, a two-tone positional siren with doppler, the helicopter rotor,
footsteps, pickup chimes, UI clicks; ambience of distant traffic, birds by day, crickets at night,
rain and waves near the sea.
