# Place hubs

Every registered place gets a generated hub automatically. Most places need no
WG declaration: the runtime supplies generic prose, eligible offers and NPCs,
and the standard one-minute Leave choice.

All places are generated even when their registry definition starts with
`unlocked: false`. A locked place remains available to NPC simulation but is
absent from every player-facing map, destination list, and place choice, so its
hub and place offers remain dormant. Runtime code unlocks all generated
instances of a key with `game.unlockPlacesByKey("place_key")`; that state is
saved and cannot be reversed. WG uses `@effect unlock place <place-key>` to reveal
places from story scenes, choices, or chats.

Only places with real custom prose or behavior have an authored hub in this
directory. Declare one with `@hub <place-key>`; this also implies `@kind place`
and the corresponding place selector. Do not author a Leave choice.

```wg
:: place.library [place library]
@hub library

Rows of bookshelves divide the quiet room.

@choice study "Study for a while" -> library.study
  @icon 📝
  @time 1h
@endchoice

:: library.study [event library]
@heading "A quiet study session"

You settle down with your notes.

@choice back "Finish studying" -> @exit
@endchoice
```

To trigger an event after the player leaves, put `@auto leave-place` and the
source `@place-key` on the event. Its `@onenter` block runs normally after the
exit completes. `@onenter` alone is initialization, not a trigger.

Generated NPC homes start with `unlocked: false` and stay hidden from the
player until revealed.
Use `@effect unlock place home_<npc-id>`, for example
`@effect unlock place home_taylor`,
to unlock a residence permanently. Kim's rent chat unlocks `home_kim` when
Kim shares the address.
