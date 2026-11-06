# The debug-log receiver

The Studio's Engine › Debugging keeps a journal of the last day in the browser, off unless its user turns it on. *Send the journal…* asks the lab to scrub it on the user's own machine (prompts cut out, names turned into marks, home folder, user and machine names, addresses, mails and keys removed), shows what the guard still found, and only on a yes posts the ZIP to the receiver of the Studio's card, `https://ruachstudio.art/debug/upload`. The user gets a ticket number; a public issue on GitHub needs only that number, and the journal itself never becomes public.

`receiver.py` is that receiver, the whole of it, so anyone can see what is kept and how: one file, Python's standard library only. It keeps each ZIP with a small JSON beside it (when, how big, its SHA-256, the Studio's version, the user's note, and a salted hash of the sender's address, never the address), takes four logs an hour from one address and 300 MB a day, accepts only ZIPs of text files, and mails the maintainer through the machine's own mail server.

A fork that wants its own receiver runs this one and points its lab at it with `RUACH_DEBUG_RECEIVER=https://your.site/debug/upload`.

## Running it

As an ordinary user, behind the web server (`nginx-debug.conf` is the location block; it sets `X-Real-IP`):

```
RUACH_DEBUG_STORE=~/ruach-debug/store RUACH_DEBUG_MAIL=you@example.org RUACH_DEBUG_FROM=noreply@example.org python3 receiver.py
```

A user unit keeps it running (`~/.config/systemd/user/ruach-debug.service`, then `systemctl --user enable --now ruach-debug` and `loginctl enable-linger $USER`):

```
[Unit]
Description=Ruach Studio debug-log receiver (127.0.0.1:41990, behind the web server's /debug/)

[Service]
Environment=RUACH_DEBUG_STORE=%h/ruach-debug/store
Environment=RUACH_DEBUG_MAIL=you@example.org
Environment=RUACH_DEBUG_FROM=noreply@example.org
ExecStart=/usr/bin/python3 %h/ruach-debug/receiver.py
Restart=on-failure
NoNewPrivileges=yes

[Install]
WantedBy=default.target
```
