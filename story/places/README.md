# Place hubs

Each registered place key has one authored WG hub in this directory. The files
are grouped by broad domain only to keep them manageable; every hub still has
its own entry, scene, prose, and choices.

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
authoritative leave action used elsewhere, including the normal one-minute
transition back outside.

Generated NPC residences are in `npc-homes.wg`. They remain visible on the
map, but require the corresponding `home_access_<npc-id>` flag. An invitation
scene can grant access with `@effect flag home_access_taylor true` and revoke
it later by setting the same flag to `false`.
