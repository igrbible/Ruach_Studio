"""HERESY 1489 · Content Credentials (C2PA) on the Studio's downloads (Viktor 16.10.2026: «Подпись C2PA поддерживаю»; «для паблика
нужен выключатель, и в настройках Engine нужные поля для ввода своей инфы»; «Принимаю твоё предложение»).

A signed record of where a file came from, inside the file: a RIFF chunk in a WAV, an ID3 frame in an MP3, a metadata block in a
FLAC. The sound is not touched. It says:
  created  by AI (YuE2) in Ruach Studio <version>: digitalSourceType trainedAlgorithmicMedia
  edited   for a file the Refiner made: its steps, from the take on, done by a person in Ruach Studio
  author   the name and the site or contact set in Engine, when they are set
A take imported from elsewhere is not the Studio's to sign: it goes out as it came (and the lab says so in X-C2PA).

Who signs:
  own      the install's own key and certificate, made at first use (a root and a leaf under it, P-256), kept beside the settings
           (user/c2pa/); a reader says «signer not verified», and the signature itself holds
  yours    a certificate chain and its key of one's own (PEM files), e.g. from a CA on the C2PA trust list, named as verified

Settings: user/c2pa.json {"on": true, "author": "", "contact": "", "cert": "", "key": ""} (cert and key: paths, both or neither).

HERESY 2174 (H03; the network map's item 7: POST /c2pa took any path on the disk, and its «no such file» against «not a PEM file» told a page whether a file
existed anywhere the lab may read): the certificate and its key are read from the Studio's user/ folder alone (user/c2pa/ is their place); a path
is taken from user/ when it is relative, and one that leads out of it (a link too) is refused before anything is looked at.

HERESY 2333 (the unified plan of 08.11.2026, the Reader: «Библиотека: метка «не учить» и C2PA»; §5: «экспорт и C2PA: свой профиль на мир»): a take
of the Reader is speech, not music, and says so: created by AI, its engine named (from its request), in the Reader of Ruach Studio, the engine's
credit beside it («Built with Fish Audio», which the Fish Audio Community License asks on every use); a Refiner's file of it says the same, the
take being its root. A take marked never for training (no_train.py: every take of the Reader, an engine whose terms forbid training on what it
makes) carries the training and data mining assertion of the creator assertions working group, cawg.training-mining: generative training,
training and data mining not allowed, the take's own reason as the constraint. Until now a Reader's download said «The music was made by AI
(YuE2)», which was untrue twice.
"""
import datetime
import io
import json
import os
from pathlib import Path

MIME = {"wav": "audio/wav", "flac": "audio/flac", "mp3": "audio/mpeg"}
DEFAULTS = {"on": True, "author": "", "contact": "", "cert": "", "key": ""}
KIND = {"debuzz": "Debuzz", "upscale": "Upscale", "stems": "Stems", "remaster": "Remaster", "daw": "DAW mix", "plugin": ""}


def available():
    """(True, "") when the C2PA library and cryptography are there; else (False, why), said in Engine."""
    try:
        import c2pa  # noqa: F401
        import cryptography  # noqa: F401
        return True, ""
    except ImportError as e:
        return False, f"{e.name} is not installed in the lab's .venv (pip install -r lab/requirements.txt)"


def load(cfg):
    try:
        d = json.load(open(Path(cfg) / "c2pa.json", encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    return {k: d.get(k, v) for k, v in DEFAULTS.items()}


OUTSIDE = ("the certificate and its key are read from the Studio's user/ folder only: put both files there (user/c2pa/ is their place) and name them "
           "by their path, or relative to user/ (c2pa/mine.pem)")


def _inside(cfg, p):
    """HERESY 2174: the file p names, inside cfg (user/), else ValueError(OUTSIDE), asked before the file is looked at"""
    root = Path(cfg).expanduser().resolve()
    q = Path(str(p)).expanduser()
    q = (q if q.is_absolute() else root / q).resolve()
    if root not in q.parents:
        raise ValueError(OUTSIDE)
    return q


def save(cfg, data):
    s = load(cfg)
    if "on" in data:
        s["on"] = bool(data["on"])
    for k in ("author", "contact", "cert", "key"):
        if k in data:
            s[k] = str(data[k] or "").strip()[:300]
    if bool(s["cert"]) != bool(s["key"]):
        raise ValueError("a certificate needs its key: give both files, or neither (the Studio then signs with its own)")
    if s["cert"]:
        for k in ("cert", "key"):
            if not _inside(cfg, s[k]).is_file():          # HERESY 2174: user/ first, then whether it is there
                raise ValueError(f"no such file: {s[k]}")
        _read_yours(cfg, s)                              # refused here, not at the first download
    Path(cfg).mkdir(parents=True, exist_ok=True)
    p, tmp = Path(cfg) / "c2pa.json", Path(cfg) / "c2pa.json.part"   # HERESY 2083: it was written in place; now beside it whole, on the disk, then in its place
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(s, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)
    return s


def _own(cfg):
    """The install's own chain and key, made once (the key readable by its owner alone)."""
    d = Path(cfg) / "c2pa"
    chain, key = d / "own-chain.pem", d / "own-key.pem"
    if chain.is_file() and key.is_file():
        return chain.read_bytes(), key.read_bytes()
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    now = datetime.datetime.now(datetime.timezone.utc)

    def name(cn):
        return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Ruach Studio")])

    rk, lk = ec.generate_private_key(ec.SECP256R1()), ec.generate_private_key(ec.SECP256R1())
    ku = dict(content_commitment=False, key_encipherment=False, data_encipherment=False, key_agreement=False, encipher_only=False, decipher_only=False)
    root = (x509.CertificateBuilder().subject_name(name("Ruach Studio install root")).issuer_name(name("Ruach Studio install root"))
            .public_key(rk.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=False, key_cert_sign=True, crl_sign=True, **ku), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(rk.public_key()), critical=False)
            .sign(rk, hashes.SHA256()))
    leaf = (x509.CertificateBuilder().subject_name(name("Ruach Studio install signer")).issuer_name(root.subject)
            .public_key(lk.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=True, key_cert_sign=False, crl_sign=False, **ku), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(rk.public_key()), critical=False)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(lk.public_key()), critical=False)
            .sign(rk, hashes.SHA256()))
    d.mkdir(parents=True, exist_ok=True)
    chain_b = leaf.public_bytes(serialization.Encoding.PEM) + root.public_bytes(serialization.Encoding.PEM)
    key_b = lk.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    fd = os.open(str(key), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(key_b)
    chain.write_bytes(chain_b)
    return chain_b, key_b


def _read_yours(cfg, s):
    chain = _inside(cfg, s["cert"]).read_bytes()        # HERESY 2174: a setting written before it, out of user/, is refused here as well
    key = _inside(cfg, s["key"]).read_bytes()
    if b"BEGIN CERTIFICATE" not in chain or b"PRIVATE KEY" not in key:
        raise ValueError("the certificate and the key are PEM files: -----BEGIN CERTIFICATE----- and -----BEGIN … PRIVATE KEY-----")
    return chain, key


def _alg(chain):
    """The signing algorithm the certificate's key calls for."""
    from cryptography import x509
    from cryptography.hazmat.primitives.asymmetric import ec, ed25519, rsa
    pub = x509.load_pem_x509_certificate(chain).public_key()
    if isinstance(pub, ec.EllipticCurvePublicKey):
        return {256: b"es256", 384: b"es384", 521: b"es512"}.get(pub.curve.key_size, b"es256")
    if isinstance(pub, rsa.RSAPublicKey):
        return b"ps256"
    if isinstance(pub, ed25519.Ed25519PublicKey):
        return b"ed25519"
    raise ValueError("the certificate's key is neither EC, RSA nor Ed25519")


def who(cfg):
    """Whose signature: own or yours, with the certificate's subject and issuer, for Engine."""
    from cryptography import x509
    s = load(cfg)
    chain, _ = _read_yours(cfg, s) if s["cert"] else _own(cfg)
    c = x509.load_pem_x509_certificate(chain)
    return {"signer": "yours" if s["cert"] else "own", "subject": c.subject.rfc4514_string(), "issuer": c.issuer.rfc4514_string(),
            "until": c.not_valid_after_utc.strftime("%Y-%m-%d")}


def status(cfg):
    ok, why = available()
    out = dict(load(cfg), available=ok, error=why)
    if ok:
        try:
            out.update(who(cfg))
        except (OSError, ValueError) as e:
            out.update(available=False, error=str(e))
    return out


TRAINING = ("cawg.ai_generative_training", "cawg.ai_training", "cawg.data_mining")   # HERESY 2333: what a take marked never for training forbids


def made_of(req, meta=None):
    """HERESY 2333: what made a take, from its request.json (and meta.json): {"speech": the Reader's (its "reader" block), "engine": its label,
    "credit": the engine's credit line, "no_train": marked never for training in either, "why": the mark's reason}. Words only, read from the
    take: nothing here knows an engine."""
    req = req if isinstance(req, dict) else {}
    meta = meta if isinstance(meta, dict) else {}
    r = req.get("reader") if isinstance(req.get("reader"), dict) else None
    prov = meta.get("provenance") if isinstance(meta.get("provenance"), dict) else {}
    out = {"speech": r is not None, "no_train": bool(req.get("no_train") or meta.get("no_train")), "why": str(prov.get("why") or "")[:200]}
    if r is not None:
        out["engine"] = " ".join(str(r.get("engine_label") or r.get("engine") or "").split())[:80]
        out["credit"] = " ".join(str(r.get("credit") or "").split())[:80]
    return out


def manifest(title, version, author="", contact="", edits=None, made=None):
    made = made or {}
    if made.get("speech"):                       # HERESY 2333: the Reader's speech, its engine named, its credit beside it
        eng = made.get("engine") or "a speech engine"
        actions = [{"action": "c2pa.created", "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
                    "softwareAgent": {"name": f"{eng} in the Narrator of Ruach Studio {version}"},
                    "description": f"The speech was made by AI ({eng}) in the Narrator of Ruach Studio." + (f" {made['credit']}." if made.get("credit") else "")}]
    else:
        actions = [{"action": "c2pa.created", "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
                    "softwareAgent": {"name": f"YuE2 (m-a-p/YuE2-3B) in Ruach Studio {version}"},
                    "description": "The music was made by AI (YuE2) in Ruach Studio."}]
    if edits:
        actions.append({"action": "c2pa.edited", "softwareAgent": {"name": f"Ruach Studio {version} Refiner"},
                        "description": "Refined by a person in Ruach Studio: " + " → ".join(edits) + "."})
    m = {"claim_generator_info": [{"name": "Ruach Studio", "version": version}], "title": title or "Ruach Studio take",
         "assertions": [{"label": "c2pa.actions", "data": {"actions": actions}}]}
    if made.get("no_train"):                     # HERESY 2333: never for training, said where every C2PA reader looks
        why = "Never for training" + (f": {made['why']}" if made.get("why") else "") + "."
        m["assertions"].append({"label": "cawg.training-mining", "data": {"entries": {k: {"use": "notAllowed", "constraint_info": why} for k in TRAINING}}})
    if author or contact:
        person = {"@type": "Person", "name": author or contact}
        if contact:
            person["url" if contact.startswith(("http://", "https://")) else "email" if "@" in contact else "identifier"] = contact
        m["assertions"].append({"label": "stds.schema-org.CreativeWork", "data": {"@context": "https://schema.org", "@type": "CreativeWork", "author": [person]}})
    return m


def edits_of(take_dir, rel):
    """The Refiner's steps a file of the take's tree came through, from the take on: the branch it lies in, the branch that one was
    made from, …; a plugin's step by its own name."""
    out, seen = [], set()
    rel = str(rel or "")
    while rel.startswith("derived/"):
        bid = rel.split("/")[1]
        if bid in seen:
            break
        seen.add(bid)
        try:
            m = json.load(open(Path(take_dir) / "derived" / bid / "manifest.json", encoding="utf-8"))
        except (OSError, ValueError):
            break
        out.append(m.get("label") if m.get("kind") == "plugin" else KIND.get(m.get("kind"), m.get("kind") or "a step"))
        rel = str(m.get("source") or "")
    return [e for e in reversed(out) if e]


def sign(cfg, data, fmt, title, version, edits=None, made=None):
    """The bytes with a manifest signed in; ValueError with the reason when they cannot be. made: made_of(request, meta) of the take (2333)."""
    import c2pa
    if fmt not in MIME:
        raise ValueError(f"no C2PA for .{fmt} here (wav, flac, mp3)")
    s = load(cfg)
    chain, key = _read_yours(cfg, s) if s["cert"] else _own(cfg)
    signer = c2pa.Signer.from_info(c2pa.C2paSignerInfo(_alg(chain), chain, key, None))
    src, dst = io.BytesIO(data), io.BytesIO()
    with c2pa.Builder(manifest(title, version, s["author"], s["contact"], edits, made)) as b:
        b.sign(signer, MIME[fmt], src, dst)
    return dst.getvalue()


def read(data, fmt):
    """What a reader sees in the bytes: the active manifest's actions and author, the validation state, and (2333) what it says of training
    ({entry: use}) and the description of its making."""
    import c2pa
    with c2pa.Reader(MIME[fmt], io.BytesIO(data)) as r:
        m = json.loads(r.json())
        act = m["manifests"][m["active_manifest"]]
        acts = [a for x in act["assertions"] if x["label"].startswith("c2pa.actions") for a in x["data"]["actions"]]
        return {"state": str(r.get_validation_state()), "failures": [f.get("code") for f in ((r.get_validation_results() or {}).get("activeManifest") or {}).get("failure", [])],
                "actions": [a["action"] for a in acts],
                "made": next((a.get("description", "") for a in acts if a["action"] == "c2pa.created"), ""),
                "training": {k: v.get("use") for x in act["assertions"] if x["label"].endswith("training-mining") for k, v in (x["data"].get("entries") or {}).items()},
                "author": [a for x in act["assertions"] if x["label"] == "stds.schema-org.CreativeWork" for a in x["data"].get("author", [])],
                "signer": (act.get("signature_info") or {}).get("issuer", "")}
