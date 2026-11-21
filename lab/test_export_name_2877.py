"""HERESY 2877: an export's ZIP is named for the Studio and the room it was asked from; an unknown or missing room packs as the library."""
import collection as c

s, x = "20261119-2342", "3b9002f533d6"
assert c.export_name("musician", s, x) == "ruach-studio-musician-20261119-2342-3b9002f533d6.zip"
for room in c.EXPORT_ROOMS:
    assert c.export_name(room, s, x) == f"ruach-studio-{room}-{s}-{x}.zip"
for bad in ("", "../x", "Musician", "library ", None):
    assert c.export_name(bad or "", s, x) == f"ruach-studio-library-{s}-{x}.zip", bad
print("test_export_name_2877: all passed")
