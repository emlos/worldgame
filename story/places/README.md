# Place hubs

Each registered place key has one authored WG hub in this directory. The files
are grouped by broad domain only to keep them manageable; every hub still has
its own entry, scene, prose, and choices.

All hubs are compiled even when their registry place starts with
`unlocked: false`. A locked place remains generated for NPC simulation but is
absent from every player-facing map, destination list, and entry choice, so its
hub and place offers remain dormant. Runtime code unlocks all generated
instances of a key with `game.unlockPlacesByKey("place_key")`; that state is
saved and cannot be reversed. WG uses `@unlock place <place-key>` to reveal
places from story scenes, choices, or chats.

The initial activity choices deliberately target their own hub and have no
time or state effects. They are scaffolds: selecting one simply redraws the
same place menu. To expand an activity, point it at a new scene and add the
desired `@time`, conditions, requirements, previews, and effects there.

```wg
@choice study "Study for a while" -> library.study
  @icon 📝
  @time 1h
@endchoice

:: library.study [event library]
@heading "A quiet study session"

You settle down with your notes.

@choice back "Finish studying" -> place.library
@endchoice
```

Use `@leave-place` for the exit choice. The runtime converts it to the same
authoritative leave action used elsewhere. The target does not add time by
itself, so include `@time 1m` when leaving should use the normal one-minute
transition back outside.

Authored NPC residence hubs are in `npc-homes.wg`. All generated NPC homes
start with `unlocked: false` and stay hidden from the player until revealed.
Use `@unlock place home_<npc-id>`, for example `@unlock place home_taylor`,
to unlock a residence permanently. Kim's rent chat unlocks `home_kim` when
Kim shares the address.
