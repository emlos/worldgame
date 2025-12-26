const UI = {
    "button.continue": "Kontynuuj",
    "button.start": "Rozpocznij grę",
    "button.load": "Załaduj grę",
    "button.save": "Zapisz grę",
    "button.delete": "Usuń",
    "button.cancel": "Anuluj",
    "button.confirm": "Potwierdź",

    "label.language": "Język",
    "label.time": "Czas",
    "label.location": "Lokalizacja",
    "label.place": "Miejsce",
    "label.flags": "Flagi",
}

const MESSAGES = {
    "game.welcome": "Witamy w World Game!",
    "game.saved": "Gra została pomyślnie zapisana.",
    "game.loaded": "Gra została pomyślnie załadowana.",
    "game.deleted": "Zapis gry został usunięty.",
}

const misc = {
    "misc.yes": "Tak",
    "misc.no": "Nie",
    "misc.ok": "OK",
    "misc.exit": "Wyjście",

    "time.minute.singular": "min",
    "time.minute.plural": "mins",
    "time.hour.singular": "godz",
    "time.hour.plural": "godz",
    "time.day.singular": "dień",
    "time.day.plural": "dni",
    "time.week.singular": "tydzień",
    "time.week.plural": "tygodnie", //TODO: figure out how to handle polish grammar cases
    "time.month.singular": "miesiąc", 
    "time.month.plural": "miesiące",
    "time.year.singular": "rok",
    "time.year.plural": "lata",
}

export const COMMON = {
    ...UI,
    ...MESSAGES,
    ...misc,
};