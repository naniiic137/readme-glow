<p align="center">
  <img src="docs/logo.svg" alt="Pixel Quest logo: Moss the lighthouse keeper holding a glowing lantern" width="128" height="128">
</p>

<h1 align="center">Pixel Quest: The Clockwork Isles</h1>

<p align="center">
  <em>A cosy pixel-art adventure about a lighthouse keeper, a lost lantern and a sea full of broken machines.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Godot-4.3-478CBF?logo=godotengine&logoColor=white" alt="Godot 4.3">
  <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Web-8B5CF6" alt="Platforms: Windows, macOS, Linux, Web">
  <img src="https://img.shields.io/badge/status-early%20access-F59E0B" alt="Status: early access">
  <img src="https://img.shields.io/badge/jam-Pixel%20Week%202026-EC4899" alt="Made for Pixel Week 2026">
</p>

![Moss walking through the Whispering Forest at dusk, with fireflies and a signpost](docs/screenshots/forest.svg "The Whispering Forest, the first of five islands")

## Story

> The great lantern of Tidewatch has gone dark, and without it the ships of the Clockwork Isles have forgotten their way home.
> You are Moss, the youngest keeper the lighthouse has ever had. Armed with a borrowed sword and a very stubborn lantern, you set sail to find the five brass gears that will make it shine again.

## Features

- **Five hand-drawn islands**, each with its own music, puzzles and secrets
- **Lantern mechanics**: light reveals hidden paths, scares shadow crabs and powers old machines
- **Gentle combat** with a dodge roll and no permadeath
- **Crafting** from driftwood, cogs and sea glass
- **Photo mode** with 12 retro colour palettes
- Fully playable with a keyboard, a gamepad or a touch screen

## Accessibility

- Every control can be remapped, and any "hold" action can become a toggle
- Colour-blind friendly palettes and a high-contrast outline mode
- Screen shake and flashing effects can be switched off
- Text size from 100% to 200%, with a dyslexia-friendly font option

> [!TIP]
> Press <kbd>F1</kbd> at any time to open the accessibility menu, even in the middle of a fight.

## Screenshots

| Mossy Caves | Harbour Village | The Clockwork Warden |
| :---------: | :-------------: | :------------------: |
| ![A glowing cave with crystals and a mine cart](docs/screenshots/caves.svg "Mossy Caves") | ![A harbour village with lanterns, boats and a market](docs/screenshots/village.svg "Harbour Village") | ![A giant clockwork boss towering over Moss](docs/screenshots/boss.svg "The Clockwork Warden") |

## Controls

| Action           | Keyboard                                   | Gamepad            |
| :--------------- | :----------------------------------------- | :----------------- |
| Move             | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrow keys | Left stick |
| Attack           | <kbd>J</kbd>                               | <kbd>X</kbd> / <kbd>□</kbd> |
| Dodge roll       | <kbd>Space</kbd>                           | <kbd>A</kbd> / <kbd>✕</kbd> |
| Raise lantern    | <kbd>K</kbd>                               | <kbd>RT</kbd>      |
| Inventory        | <kbd>Tab</kbd>                             | <kbd>Y</kbd> / <kbd>△</kbd> |
| Pause            | <kbd>Esc</kbd>                             | <kbd>Start</kbd>   |

## Play it

Download the latest build from the [releases page](https://github.com/pixel-quest/clockwork-isles/releases), or play in your browser on [itch.io](https://pixel-quest.itch.io/clockwork-isles).

To run it from source, install [Godot 4.3](https://godotengine.org/download) and open `project.godot`, or export from the command line:

```bash
godot --headless --export-release "Web" build/web/index.html
```

The player controller is a good place to start reading the code:

```gdscript title="scripts/player.gd"
extends CharacterBody2D

const SPEED := 90.0
const ROLL_SPEED := 180.0

@onready var lantern: PointLight2D = $Lantern

func _physics_process(delta: float) -> void:
	var input := Input.get_vector("left", "right", "up", "down")
	velocity = input * (ROLL_SPEED if is_rolling() else SPEED)
	lantern.energy = lerp(lantern.energy, 1.4 if Input.is_action_pressed("lantern") else 0.6, 8.0 * delta)
	move_and_slide()
```

## Spoilers

<details>
<summary>Where is the third gear? (spoiler)</summary>

Behind the waterfall in the Mossy Caves. Raise your lantern next to the moss-covered wall and the path appears.

</details>

<details>
<summary>How do I beat the Clockwork Warden? (big spoiler)</summary>

Wait for the steam vents on its back to open, then roll behind it and strike the glowing cog. It speeds up after each hit, so keep your lantern low.

</details>

## Roadmap

- [x] Five islands and the main story
- [x] Gamepad and touch controls
- [x] Photo mode
- [ ] New Game+ with remixed puzzles
- [ ] Steam Deck verification
- [ ] Arabic, French and Japanese translations

## لمحة

**بيكسل كويست** مغامرة هادئة بأسلوب البكسل، تتقمّص فيها دور «موس»، حارسة المنارة الصغيرة، في رحلة عبر خمس جزر بحثاً عن التروس النحاسية الخمسة التي تعيد النور إلى الفانوس العظيم.

- خمس جزر مرسومة يدوياً، لكل منها موسيقاها وألغازها
- قتال لطيف دون خسارة دائمة للتقدّم
- دعم كامل للوحة المفاتيح وذراع التحكّم وشاشات اللمس

## Credits

| Role              | Name                                   |
| :---------------- | :------------------------------------- |
| Design and code   | @saltwater                             |
| Pixel art         | @inkfox                                |
| Music             | Lo-Fi Lighthouse Orchestra             |
| Font              | *Pixelify Sans* (SIL OFL 1.1)          |
| Playtesting       | The Pixel Week 2026 community :heart:  |

Made with [Godot Engine](https://godotengine.org). Code under the MIT Licence; art and music © 2026 the Pixel Quest team.
