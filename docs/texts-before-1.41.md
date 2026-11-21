# Texte vor 1.41.0

Tab Guard 1.41.0 hat die deutschen Texte stark überarbeitet. Hier steht jeder geänderte Text, wie er bis 1.40.1 war, und wie er jetzt heißt. Die ganze alte Fassung steht in `extension/assets/i18n.js` im Commit `557cceb` (Version 1.40.1).

Entfernt: `cd_small` (wurde nirgends angezeigt). Neu: `cd_back` und `cd_break` (Knöpfe auf den Sperr- und Pausenseiten).

| Schlüssel | Bis 1.40.1 | Ab 1.41.0 |
|---|---|---|
| `lockedRow` | gesperrt | ausgebremst |
| `lockedBadge` | gesperrt | ausgebremst |
| `st_grey` | graustufig | grau |
| `blockSite` | diese Seite sperren | Diese Seite sperren |
| `resumeAuto` | jetzt fortsetzen · auto in {m} Min | Jetzt fortsetzen · von selbst in {m} Min. |
| `unlockDomain` | Domain entsperren | Seite entsperren |
| `pg_ok` | entsperren | Entsperren |
| `pg_cancel` | abbrechen | Abbrechen |
| `cd_adultTitle` | Gesperrt – Jugendschutz | Gesperrt durch den Jugendschutz |
| `cd_removeHint` | Zum Entsperren in den Tab-Guard-Einstellungen entfernen — dafür brauchst du deinen Code. | Zum Entsperren in den Tab-Guard-Einstellungen entfernen – dafür brauchst du deinen Code. |
| `cd_lockedReason` | Viele Tabs in kurzer Zeit – die Seite macht deshalb kurz Pause. | Viele Tabs in kurzer Zeit – die Seite ist deshalb kurz ausgebremst. |
| `nt_resumeMsg` | Deine Pause ist vorbei — Tab Guard passt wieder auf. | Deine Pause ist vorbei – Tab Guard passt wieder auf. |
| `o_h_intention` | Intention & Alternativvorschläge | Absicht & Alternativen |
| `o_h_friction` | Reibungssperre | Wartezeiten |
| `o_h_lock` | Einstellungssperre | Einstellungsschutz |
| `o_n_language` | Gilt für Popup, Interventionen und Sperrseiten. „Auto“ folgt dem Browser. | Gilt für Popup, Pausen und Sperrseiten. „Auto“ folgt dem Browser. |
| `o_n_trusted` | Eine Seite pro Zeile, Subdomains sind mit dabei. Alles, was hier nicht steht, wird beobachtet. Neue Einträge gelten erst nach einer Stunde. | Eine Seite pro Zeile, Subdomains sind mit dabei. Alles, was hier nicht steht, wird beobachtet. Neue Einträge sind eine Lockerung: Sie gilt in einer Stunde. |
| `o_n_blocklist` | Diese Seiten sind immer gesperrt, ohne Vorstufen. Du kannst sie auch über das Popup hinzufügen. Entfernen gilt erst nach einer Stunde. | Diese Seiten sind immer gesperrt, ohne Vorstufen. Du kannst sie auch über das Popup hinzufügen. Entfernen ist eine Lockerung: Sie gilt in einer Stunde. |
| `o_n_lock` | Schütze diese Einstellungen mit einem Code, den du von Hand tippst (kein Einfügen), mit begrenzten Änderungen. Reibung, kein Tresor — Neuinstallation setzt zurück. | Schütze diese Einstellungen mit einem Code, den du von Hand tippst (kein Einfügen), mit begrenzten Änderungen. Reibung, kein Tresor – Neuinstallation setzt zurück. |
| `o_l_within` | …innerhalb Sekunden | … innerhalb von (Sek.) |
| `o_l_autoBlock` | Domain bei Sperrung automatisch aufnehmen | Ausgebremste Seiten automatisch auf die Sperrliste setzen |
| `o_l_intentShow` | Nach der Intention fragen | Nach der Absicht fragen |
| `o_l_sourcesAfter` | …erst ab (aktive Min) | …erst ab (aktive Min.) |
| `o_l_lockAfterN` | Sperren nach N Tabs | Ausbremsen nach N Tabs |
| `o_l_lockDur` | Sperrdauer (Min) | Dauer der Bremse (Min.) |
| `o_l_cooldownIgnored` | Cooldown nach N Ignorierten | Abkühlpause nach N übergangenen Pausen |
| `o_l_intensity` | Intensitäts-Schwelle (0–100) | Ab welcher Scroll-Stärke (0–100) |
| `o_l_watchAfter` | Beobachten ab (aktive Min) | Beobachten ab (aktive Min.) |
| `o_l_breathPause` | Atempause (Sek) | Atempause (Sek.) |
| `o_l_revealDelay` | Enthüll-Verzögerung min–max (Sek) | Anzeigen nach (Sek., min.–max.) |
| `o_l_idleAfter` | Gilt als untätig nach (Sek) | Gilt als untätig nach (Sek.) |
| `o_l_continueUnlock` | „Trotzdem weiter“ möglich nach (Sek) | „Trotzdem weiter“ möglich nach (Sek.) |
| `o_l_autoResume` | Pause endet automatisch nach (Min) | Pause endet automatisch nach (Min.) |
| `o_l_lockStatus` | Sperrstatus | Schutz |
| `o_b_lockSettings` | Einstellungen sperren | Einstellungen schützen |
| `o_b_removeLock` | Sperre entfernen… | Schutz entfernen … |
| `o_b_export` | JSON exportieren | Als Datei exportieren |
| `o_frozen` | eingefroren — Neuinstallation setzt zurück | eingefroren – Neuinstallation setzt zurück |
| `o_importOk` | Importiert ✓ — lädt neu… | Importiert ✓ – lädt neu… |
| `o_g_titleRemove` | Zum Entfernen der Sperre tippen | Zum Entfernen des Schutzes tippen |
| `o_g_mismatch` | Stimmt nicht — tippe den Code exakt ab. | Stimmt nicht – tippe den Code exakt ab. |
| `o_g_leftReinstall` | keine Änderungen übrig — Neuinstallation setzt zurück | keine Änderungen übrig – Neuinstallation setzt zurück |
| `o_l_adultGreyLinks` | Links zu Adult-Seiten ausgrauen | Links zu Erwachsenen-Seiten ausgrauen |
| `o_l_adultDetect` | Adult-Seiten an dem erkennen, was sie über sich selbst sagen | Erwachsenen-Seiten an dem erkennen, was sie über sich selbst sagen |
| `o_n_adultLearned` | Merkmale: die gesetzliche Seite zu 18 U.S.C. 2257, das RTA-Label, ein Tube-Videosystem, eindeutige Titel, Links zu bekannten Adult-Seiten. Erkannte Seiten landen unten in der Liste und werden beim nächsten Mal vor dem Laden geschlossen. Die Liste kannst du frei bearbeiten. | Merkmale: die gesetzliche Seite zu 18 U.S.C. 2257, das RTA-Label, ein Tube-Videosystem, eindeutige Titel, Links zu bekannten Erwachsenen-Seiten. Erkannte Seiten landen unten in der Liste und werden beim nächsten Mal vor dem Laden geschlossen. Die Liste kannst du frei bearbeiten. |
| `o_n_proxies` | Adressen mit ezproxy. oder libproxy. darin — so leiten Hochschulen Zeitschriften und Datenbanken um — werden nie pausiert oder gesperrt. | Adressen mit ezproxy. oder libproxy. darin – so leiten Hochschulen Zeitschriften und Datenbanken um – werden nie pausiert oder gesperrt. |
| `nt_lockTitle` | Seite gesperrt | Ausgebremst |
| `nt_lockBody` | {host} ist für {m} Min gesperrt — {n} Tabs in {s} s. | {host} ist {m} Min. ausgebremst – {n} Tabs in {s} s. |
| `o_n_pause` | Der Button „Schutz pausieren…“ im Popup schaltet alles für eine Weile aus. Danach schaltet sich der Schutz immer von selbst wieder ein. | Der Knopf „Schutz pausieren…“ im Popup schaltet alles für eine Weile aus. Danach schaltet sich der Schutz immer von selbst wieder ein. |
| `pg_s_open` | aktiv · noch {n}, dann Button | aktiv · noch {n} frei |
| `o_n_pagination` | Nach der ersten Seite eines Endlos-Feeds warten neue Beiträge hinter einem Button im Feed; jeder Klick zeigt nach kurzem Countdown die nächste Seite. Bestätigt auf LinkedIn. Auf anderen Seiten, deren Feed eine einfache Liste ist, versucht die Erweiterung den Feed selbst zu erkennen; Raster (YouTube-Startseite) und Feeds mit absolut positionierten Beiträgen (X/Twitter) bleiben unberührt. Ob es auf der aktuellen Seite greift, zeigt das Popup. | Nach der ersten Seite eines Endlos-Feeds warten neue Beiträge hinter einem Knopf im Feed; jeder Klick zeigt nach kurzem Countdown die nächste Seite. Bestätigt auf LinkedIn. Auf anderen Seiten, deren Feed eine einfache Liste ist, versucht die Erweiterung den Feed selbst zu erkennen; Raster (YouTube-Startseite) und Feeds mit absolut positionierten Beiträgen (X/Twitter) bleiben unberührt. Ob es auf der aktuellen Seite greift, zeigt das Popup. |
| `o_l_pgDelay` | Button-Countdown (Sek, 0=sofort) | Wartezeit vor dem Weiterladen (Sek., 0 = sofort) |
| `o_n_pgHosts` | Vertraute Seiten bleiben aus. Hier eingetragene Hosts werden trotzdem erfasst. | Vertraute Seiten bleiben aus. Hier eingetragene Seiten werden trotzdem erfasst. |
| `rv_settings` | Reveal-Einstellungen | Einstellungen fürs Anzeigen |
| `o_l_allowReveal` | Reveal-Button erlauben (aus = kein Spicken) | Knopf „zeigen“ erlauben (aus = kein Spicken) |
| `o_n_breaker` | Öffnest du dieselbe beobachtete Seite in kurzer Zeit in vielen Tabs, kommt erst eine Pause, dann eine Sperre. | Öffnest du dieselbe beobachtete Seite in kurzer Zeit in vielen Tabs, kommt erst eine Pause, dann wirst du ausgebremst. |
| `o_n_scroll` | Scrollst du ein paar Minuten lang schnell und ohne Pause auf einer beobachteten Seite, kommt die Atempause mit der Frage nach deiner Intention. | Scrollst du ein paar Minuten lang schnell und ohne Pause auf einer beobachteten Seite, kommt die Atempause mit der Frage nach deiner Absicht. |
| `o_n_friction` | Wie lange der ‚Weiter‘-Button gesperrt bleibt und wann eine Pause den Schutz von selbst wieder einschaltet. | Wie lange der Knopf „Trotzdem weiter“ wartet und wann eine Pause den Schutz von selbst wieder einschaltet. |
| `o_n_sf_actions` | Aktion: unscharf = verwischt, Klick zeigt es · graustufig = entfärbt · entfernen = ganz ausgeblendet · einklappen = durch kleinen ‚ausgeblendet‘-Hinweis ersetzt · pausieren = Wiedergabe stoppen. | Aktion: unscharf = verwischt, Klick zeigt es · grau = entfärbt · entfernen = ganz ausgeblendet · einklappen = durch kleinen Hinweis „ausgeblendet“ ersetzt · pausieren = Wiedergabe stoppen. |
| `o_l_fbAll` | Full-Site-Blur auf allen beobachteten Seiten | Ganze Seite unscharf auf allen beobachteten Seiten |
| `o_l_fbLinks` | Links während des Blurs deaktivieren | Links abschalten, solange die Seite unscharf ist |
| `o_l_sfMin` | Videos kürzer als ausblenden (Sek, 0=aus) | Videos ausblenden, die kürzer sind als (Sek., 0 = aus) |
| `sf_a_greyscale` | graustufig | grau |
| `o_h_fullblur` | Full-Site-Blur | Ganze Seite unscharf |
| `reveal` | ◐ zeigen | ◐ Zeigen |
| `ex_nowPause` | jetzt pausieren | Jetzt pausieren |
| `ex_nowReset` | jetzt zurücksetzen | Jetzt zurücksetzen |
| `ex_nowHalve` | jetzt halbieren | Jetzt halbieren |
| `ex_infoEmpty` | Heute keine Notausgänge mehr — morgen wieder. | Heute keine Notausgänge mehr – morgen wieder. |
| `ex_cancel` | doch nicht | Doch nicht |
| `ex_close` | schließen | Schließen |
| `ex_failed` | Hat nicht geklappt — öffne das Popup und versuch es noch einmal. | Hat nicht geklappt – öffne das Popup und versuch es noch einmal. |
| `o_n_exits` | Jede Pause und jedes Zurücksetzen wartet heute länger als das vorige: 5, 10, 15, 20 s und mehr. Bis 20 s läuft der Countdown auf dem Button, längere Wartezeiten zeigen einen Ladebalken. Wartezeit und Budget fangen neu an, wenn dein Tag beginnt — standardmäßig um 5:00, wenn der Nachtmodus endet; Mitternacht läge mitten in den anfälligsten Stunden. Lockerungen (mehr Budget, kürzere Wartezeit, früherer Tagesanfang, Ausschalten) greifen erst eine Stunde nach dem Speichern; Verschärfungen sofort. | Jede Pause und jedes Zurücksetzen wartet heute länger als das vorige: 5, 10, 15, 20 s und mehr. Bis 20 s läuft der Countdown auf dem Knopf, längere Wartezeiten zeigen einen Ladebalken. Wartezeit und Budget fangen neu an, wenn dein Tag beginnt – standardmäßig um 5:00, wenn der Nachtmodus endet; Mitternacht läge mitten in den anfälligsten Stunden. Lockerungen (mehr Budget, kürzere Wartezeit, früherer Tagesanfang, Ausschalten) greifen erst eine Stunde nach dem Speichern; Verschärfungen sofort. |
| `o_l_ctImport` | Liste hinzufügen (Cold Turkey, Hosts-Datei) | Liste hinzufügen (Cold Turkey, hosts-Datei) |
| `o_b_ctRemove` | entfernen | Entfernen |
| `o_b_builtin` | anzeigen… | Anzeigen … |
| `o_b_biShow` | anzeigen | Anzeigen |
| `o_ct_removeAt` | Wird um {t} Uhr entfernt. Lockerungen gelten erst nach einer Stunde. | Wird um {t} Uhr entfernt. Lockerung gilt in einer Stunde. |
| `sf_swipeText` | Bildschirmhohe Clips zum Durchwischen — das Format, aus dem du raus wolltest. | Bildschirmhohe Clips zum Durchwischen – das Format, aus dem du raus wolltest. |
| `o_n_essential` | Hilfe in Krisen, Notrufe, Giftnotruf, Apotheken und öffentliche Gesundheitsseiten werden nie gesperrt, gebremst oder ausgegraut – keine Regel kann sie sperren, auch nicht die Blockliste, der Jugendschutz oder eine importierte Liste. Dazu gehören alle Behörden-Adressen (z. B. .gov, bund.de, gv.at, gob.es, gov.ro). | Hilfe in Krisen, Notrufe, Giftnotruf, Apotheken und öffentliche Gesundheitsseiten werden nie gesperrt, gebremst oder ausgegraut – keine Regel kann sie sperren, auch nicht die Sperrliste, der Jugendschutz oder eine importierte Liste. Dazu gehören alle Behörden-Adressen (z. B. .gov, bund.de, gv.at, gob.es, gov.ro). |
| `o_n_essentialExtra` | Eigene Ergänzungen, eine Domain pro Zeile. Neue Einträge gelten nach einer Stunde. | Eigene Ergänzungen, eine Domain pro Zeile. Neue Einträge sind eine Lockerung: Sie gilt in einer Stunde. |
| `em_end` | beenden | Beenden |
| `o_n_bypassSites` | Erkannte Proxy- und Unblocker-Seiten, eine pro Zeile (bei geteilten Hosts mit dem Projekt-Pfad). Entfernen greift nach einer Stunde. | Erkannte Proxy- und Unblocker-Seiten, eine pro Zeile (bei geteilten Hosts mit dem Projekt-Pfad). Entfernen ist eine Lockerung: Sie gilt in einer Stunde. |
| `cd_hintLock` | Freigeben kannst du sie in den Tab-Guard-Einstellungen, mit deinem Code. Sie öffnet sich eine Stunde nach dem Speichern. | Freigeben kannst du sie in den Tab-Guard-Einstellungen, mit deinem Code. Lockerung gilt in einer Stunde. |
| `cd_hintNoLock` | Freigeben kannst du sie in den Tab-Guard-Einstellungen. Sie öffnet sich eine Stunde nach dem Speichern. | Freigeben kannst du sie in den Tab-Guard-Einstellungen. Lockerung gilt in einer Stunde. |
| `cd_hintProxy` | Falls das ein Irrtum ist: In den Einstellungen unter „Jugendschutz“ kannst du sie wieder freigeben. Sie öffnet sich eine Stunde nach dem Speichern. | Falls das ein Irrtum ist: In den Einstellungen unter „Jugendschutz“ kannst du sie wieder freigeben. Lockerung gilt in einer Stunde. |
| `o_h_waitroom` | Wartezimmer für Seiten | Warteraum |
| `o_b_ctKeep` | doch behalten | Doch behalten |
| `o_b_tour` | noch einmal ansehen | Noch einmal ansehen |
| `wr_tab` | Wartezimmer · {host} | Warteraum · {host} |
| `w_lock` | Sollen deine Regeln auch in einem schwachen Moment halten? Die Einstellungssperre verlangt vor jeder Änderung einen Code, den du von Hand abtippst. | Sollen deine Regeln auch in einem schwachen Moment halten? Der Einstellungsschutz verlangt vor jeder Änderung einen Code, den du von Hand abtippst. |
| `w_lockBtn` | Sperre einrichten | Schutz einrichten |
| `w_later` | Lockerst du hier etwas (mehr vertraute Seiten, Jugendschutz aus), gilt das erst nach einer Stunde, wie in den Einstellungen. | Lockerst du hier etwas (mehr vertraute Seiten, Jugendschutz aus), gilt das wie in den Einstellungen: Lockerung gilt in einer Stunde. |
| `o_px_tabLock` | Tab-Sperre: +{n} | ausgebremst: +{n} |
| `o_pxl_tabLock` | eine Tab-Sperre | einmal ausgebremst (viele Tabs einer Seite) |
| `o_px_desc2` | Eine Beispiel-Stunde, gezeichnet mit deinen Einstellungen. Jede Zahl ist etwas, das du getan hast; auch die Bremse selbst (eine Pause, eine Sperre) erhöht den Druck. | Eine Beispiel-Stunde, gezeichnet mit deinen Einstellungen. Jede Zahl ist etwas, das du getan hast; auch die Bremse selbst (eine Pause, ausgebremst werden) erhöht den Druck. |
| `o_px_more` | Nicht im Beispiel: Eine Tab-Sperre bringt +{lock}, Such-Hopping +{churn}. Ab Minute 17 passiert nichts mehr, und der Druck klingt ab. | Nicht im Beispiel: Ausgebremst werden bringt +{lock}, Such-Hopping +{churn}. Ab Minute 17 passiert nichts mehr, und der Druck klingt ab. |
| `cd_small` | Vielleicht ist jetzt ein guter Moment für das, weswegen du den Browser geöffnet hast. Die Seite lädt nur gerade noch nicht. | (entfernt) |
