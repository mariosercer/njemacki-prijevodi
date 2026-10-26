/* Izračun okvirne cijene prijevoda 1.8 – Mario Šercer */
(function () {
	'use strict';

	// Biblioteke se učitavaju tek kad zatreba (npr. OCR samo za slike i skenirane PDF-ove).
	var BIBLIOTEKE = {
		pdf: { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', globalno: 'pdfjsLib' },
		// Čitač starog .doc formata dolazi s pluginom; adresa se postavlja iz data-doc-skripta.
		worddoc: { src: '', globalno: 'KKWordDoc' },
		xlsx: { src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', globalno: 'XLSX' },
		tesseract: { src: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js', globalno: 'Tesseract' },
		sortable: { src: 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js', globalno: 'Sortable' },
		// Cloudflare Turnstile: učitava se samo ako su u postavkama plugina upisani ključevi.
		turnstile: { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', globalno: 'turnstile' },
		jszip: { src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', globalno: 'JSZip' }
	};
	var PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

	var VRSTE = {
		pdf: 'pdf',
		docx: 'docx', docm: 'docx', dotx: 'docx',
		doc: 'doc', dot: 'doc',
		odt: 'odt', ott: 'odt',
		xlsx: 'tablica', xlsm: 'tablica', xls: 'tablica', ods: 'tablica', csv: 'tablica',
		txt: 'txt',
		png: 'slika', jpg: 'slika', jpeg: 'slika', webp: 'slika', bmp: 'slika'
	};
	var OZNAKE = { pdf: 'PDF', docx: 'DOCX', doc: 'DOC', odt: 'ODT', tablica: 'XLS', txt: 'TXT', slika: 'SLIKA' };
	var NEPODRZANO = {
		rtf: 'Format .rtf nije podržan. Spremite datoteku kao .docx ili PDF.',
		heic: 'Format HEIC nije podržan. Spremite sliku kao JPG ili PNG.',
		tif: 'TIFF slike nisu podržane. Spremite sliku kao PNG ili JPG.',
		tiff: 'TIFF slike nisu podržane. Spremite sliku kao PNG ili JPG.'
	};

	// Oznaka za prijelom stranice između stranica PDF-a ili listova tablice.
	var PRIJELOM = { prijelom: true };

	var ucitane = {};
	function ucitaj(ime) {
		if (ucitane[ime]) return ucitane[ime];
		var b = BIBLIOTEKE[ime];
		if (window[b.globalno]) return (ucitane[ime] = Promise.resolve(window[b.globalno]));
		if (!b.src) return Promise.reject(new Error('Čitač za ovu vrstu datoteke nije dostupan.'));
		ucitane[ime] = new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = b.src;
			s.async = true;
			s.onload = function () {
				if (window[b.globalno]) resolve(window[b.globalno]);
				else { delete ucitane[ime]; reject(new Error('Biblioteka za čitanje datoteka nije se ispravno učitala.')); }
			};
			s.onerror = function () {
				delete ucitane[ime];
				reject(new Error('Biblioteka za čitanje datoteka nije se mogla učitati. Provjerite internetsku vezu i pokušajte ponovno.'));
			};
			document.head.appendChild(s);
		});
		return ucitane[ime];
	}

	/* ---------- Brojanje znakova ---------- */

	// Znakovi s razmacima, bez prijeloma redaka i oznaka odlomka (kao "Znakovi (s razmacima)" u Wordu).
	function brojiZnakove(tekst) {
		return Array.from(String(tekst).replace(/[\r\n\u2028\u2029\f\v]/g, '')).length;
	}

	// Zbroj znakova svih odlomaka. Isti tekst ide u Word datoteku, pa Word pokazuje isti broj.
	function zbrojiOdlomke(odlomci) {
		return odlomci.reduce(function (z, o) { return typeof o === 'string' ? z + brojiZnakove(o) : z; }, 0);
	}

	// Jedan odlomak: prijelom retka postaje razmak, rastavljene riječi se spajaju.
	function normalizirajVizualno(tekst) {
		return String(tekst)
			.replace(/(\p{L})-[ \t]*\n\s*(\p{Ll})/gu, '$1$2')
			.replace(/\s*\n\s*/g, ' ')
			.replace(/[ \t\u00a0]+/g, ' ')
			.trim();
	}

	// OCR tekst: prazan redak odvaja odlomke.
	function odlomciIzOcr(tekst) {
		return String(tekst).split(/\n[ \t]*\n/).map(normalizirajVizualno).filter(Boolean);
	}

	// PDF tekstni sloj: retci se slažu u odlomke prema razmaku između redaka.
	function odlomciIzPdf(stavke) {
		var linije = [], tren = { t: '', y: null }, kraj = null, zadnjiY = null;
		stavke.forEach(function (it) {
			if (typeof it.str !== 'string') return;
			var x = it.transform ? it.transform[4] : null, y = it.transform ? it.transform[5] : null;
			var vis = it.transform ? (Math.abs(it.transform[3]) || it.height || 0) : 0;
			// Komadi teksta koji su na stranici razmaknuti (npr. susjedne ćelije tablice) ne smiju se slijepiti.
			if (it.str && tren.t && kraj !== null && x !== null && vis && !/\s$/.test(tren.t) && !/^\s/.test(it.str)) {
				var razmak = x - kraj;
				if (razmak > vis * 0.25 || razmak < -vis * 0.5 || Math.abs(y - zadnjiY) > vis * 0.5) tren.t += ' ';
			}
			if (tren.y === null && it.str.trim() && it.transform) tren.y = y;
			tren.t += it.str;
			if (it.str && x !== null) { kraj = x + (it.width || 0); zadnjiY = y; }
			if (it.hasEOL) { linije.push(tren); tren = { t: '', y: null }; kraj = null; }
		});
		linije.push(tren);
		linije = linije.filter(function (l) { return l.t.trim(); });
		if (!linije.length) return [];

		var razmaci = [];
		for (var i = 1; i < linije.length; i++) {
			if (linije[i].y === null || linije[i - 1].y === null) continue;
			var g = linije[i - 1].y - linije[i].y;
			if (g > 0) razmaci.push(g);
		}
		razmaci.sort(function (a, b) { return a - b; });
		var tipicno = razmaci.length ? razmaci[Math.floor(razmaci.length / 2)] : 0;

		var odlomci = [], buf = [];
		linije.forEach(function (l, i) {
			if (i > 0 && tipicno > 0 && l.y !== null && linije[i - 1].y !== null) {
				var g = linije[i - 1].y - l.y;
				if (g > tipicno * 1.45 || g < -tipicno) { odlomci.push(buf.join('\n')); buf = []; }
			}
			buf.push(l.t);
		});
		odlomci.push(buf.join('\n'));
		return odlomci.map(normalizirajVizualno).filter(Boolean);
	}

	/* ---------- OCR ---------- */

	var ocrRadnici = {};
	var aktivniLogger = null;
	function ocrRadnik(jezici) {
		if (!ocrRadnici[jezici]) {
			ocrRadnici[jezici] = ucitaj('tesseract').then(function (T) {
				var opcije = { logger: function (m) { if (aktivniLogger) aktivniLogger(m); } };
				// Ako preglednik ne dopušta pozadinski proces iz "blob" adrese, pokušaj izravno s CDN-a.
				return T.createWorker(jezici, 1, opcije).catch(function () {
					return T.createWorker(jezici, 1, Object.assign({}, opcije, { workerBlobURL: false }));
				});
			}).catch(function (e) {
				delete ocrRadnici[jezici];
				var poruka = String((e && e.message) || e || '');
				if (/worker|blob|origin|security/i.test(poruka)) {
					throw new Error('Prepoznavanje teksta (OCR) ne može se pokrenuti u ovom prozoru. Preuzmite datoteku i otvorite je izravno u pregledniku (Chrome, Edge, Firefox ili Safari).');
				}
				throw new Error('Prepoznavanje teksta (OCR) nije se moglo pokrenuti. Provjerite internetsku vezu i pokušajte ponovno.');
			});
		}
		return ocrRadnici[jezici];
	}

	function ocr(slika, ctx, opcije) {
		aktivniLogger = function (m) {
			if (m.status !== 'recognizing text') return;
			if (ctx.ocrNapredak) ctx.ocrNapredak(m.progress);
			ctx.status((ctx.porukaOcr || 'Prepoznajem tekst…').replace(/…$/, '') + '… ' + Math.round(m.progress * 100) + ' %');
		};
		if (!ocrRadnici[ctx.jezici]) ctx.status('Pripremam prepoznavanje teksta (prvi put može potrajati)…');
		return ocrRadnik(ctx.jezici).then(function (w) {
			if (ctx.porukaOcr) ctx.status(ctx.porukaOcr);
			return w.recognize(slika, opcije || {});
		}).then(function (r) {
			aktivniLogger = null;
			if (ctx.ocrKraj) ctx.ocrKraj();
			return r.data;
		});
	}

	function ocrTekst(slika, ctx) {
		return ocr(slika, ctx).then(function (d) { return d.text || ''; });
	}

	function brojSlova(t) {
		return String(t || '').replace(/[^\p{L}\p{N}]/gu, '').length;
	}

	// Prazna stranica ili slika (gotovo bez tamnih piksela) preskače se bez OCR-a.
	function jePrazno(platno) {
		var w = 200, h = Math.max(1, Math.round(platno.height * 200 / platno.width));
		var c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		var x = c.getContext('2d', { willReadFrequently: true });
		x.fillStyle = '#ffffff';
		x.fillRect(0, 0, w, h);
		x.drawImage(platno, 0, 0, w, h);
		var p = x.getImageData(0, 0, w, h).data, tamnih = 0;
		for (var i = 0; i < p.length; i += 4) {
			if (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114 < 140) tamnih++;
		}
		return tamnih / (w * h) < 0.002;
	}

	function zakreni(platno, kut) {
		var c = document.createElement('canvas');
		var bocno = kut === 90 || kut === 270;
		c.width = bocno ? platno.height : platno.width;
		c.height = bocno ? platno.width : platno.height;
		var x = c.getContext('2d');
		x.fillStyle = '#ffffff';
		x.fillRect(0, 0, c.width, c.height);
		x.translate(c.width / 2, c.height / 2);
		x.rotate(kut * Math.PI / 180);
		x.drawImage(platno, -platno.width / 2, -platno.height / 2);
		return c;
	}

	// Umanjena kopija za brzu provjeru položaja.
	function umanji(platno, maxStrana) {
		var veca = Math.max(platno.width, platno.height);
		if (veca <= maxStrana) return platno;
		var mj = maxStrana / veca, c = document.createElement('canvas');
		c.width = Math.round(platno.width * mj);
		c.height = Math.round(platno.height * mj);
		var x = c.getContext('2d');
		x.imageSmoothingQuality = 'high';
		x.drawImage(platno, 0, 0, c.width, c.height);
		return c;
	}

	function ocjenaOcr(r) {
		return brojSlova(r.text) * Math.max(1, r.confidence || 0);
	}

	// OCR cijele stranice ili slike. Blagi nagib ispravlja Tesseract (rotateAuto). Zakretanje za 90°, 180°
	// i 270° provjerava se samo kad je prepoznato vrlo malo teksta, i to najprije na maloj kopiji slike;
	// puno prepoznavanje ponavlja se samo u položaju koji se pokaže boljim.
	async function ocrOrijentirano(platno, ctx) {
		if (jePrazno(platno)) return { text: '', kut: 0, prazno: true };
		var osnovnaPoruka = ctx.porukaOcr || 'Prepoznajem tekst…';
		var prvi = await ocr(platno, ctx, { rotateAuto: true });
		prvi.kut = 0;
		// Uspravna stranica s čitljivim tekstom (fotografije i skenovi obično 70–95 %, okrenute stranice oko 40 %).
		if (brojSlova(prvi.text) >= 40 && (prvi.confidence || 0) >= 60) return prvi;

		ctx.porukaOcr = osnovnaPoruka.replace(/…$/, '') + ' (provjeravam položaj stranice)…';
		var malo = umanji(platno, 900);
		var najKut = 0, najOcjena = -1;
		var kutovi = [0, 90, 180, 270];
		for (var i = 0; i < kutovi.length; i++) {
			var slika = kutovi[i] ? zakreni(malo, kutovi[i]) : malo;
			var r = await ocr(slika, ctx, {});
			if (slika !== malo) slika.width = slika.height = 0;
			var o = ocjenaOcr(r);
			if (o > najOcjena) { najOcjena = o; najKut = kutovi[i]; }
		}
		if (malo !== platno) malo.width = malo.height = 0;
		ctx.porukaOcr = osnovnaPoruka;
		if (!najKut) return prvi;

		var zakrenuto = zakreni(platno, najKut);
		var drugi = await ocr(zakrenuto, ctx, { rotateAuto: true });
		zakrenuto.width = zakrenuto.height = 0;
		if (ocjenaOcr(drugi) > ocjenaOcr(prvi) * 1.2) { drugi.kut = najKut; return drugi; }
		return prvi;
	}

	/* ---------- Slike unutar dokumenata ---------- */

	var SLIKA_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
	var MIN_SLIKA = 40;       // px; manje slike (ikone, crte) se preskaču
	var MIN_POUZDANOST = 50;  // prosječna pouzdanost OCR-a ispod koje se rezultat odbacuje

	// Slika na bijeloj podlozi (prozirni PNG inače postaje crn), male slike se povećavaju radi boljeg OCR-a.
	// Najveća dulja strana slike za OCR. Fotografije s mobitela (12–48 MP) smanjuju se, jer vrijeme
	// prepoznavanja raste s brojem točaka, a za brojanje znakova veća razlučivost ne donosi ništa bitno.
	var JE_MOBITEL = typeof navigator !== 'undefined' &&
		(/iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent || '')));
	var OCR_MAX_STRANA = JE_MOBITEL ? 1800 : 2400;

	async function pripremiSliku(izvor) {
		var bmp;
		try { bmp = await createImageBitmap(izvor); } catch (e) { return null; }
		var w = bmp.width, h = bmp.height, veca = Math.max(w, h);
		var mj = veca < 1200 ? Math.min(3, 1800 / veca) : 1;
		if (veca * mj > OCR_MAX_STRANA) mj = OCR_MAX_STRANA / veca;
		var c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w * mj));
		c.height = Math.max(1, Math.round(h * mj));
		var x = c.getContext('2d');
		x.fillStyle = '#ffffff';
		x.fillRect(0, 0, c.width, c.height);
		x.imageSmoothingQuality = 'high';
		x.drawImage(bmp, 0, 0, c.width, c.height);
		if (bmp.close) bmp.close();
		return { platno: c, sirina: w, visina: h };
	}

	// Tekst s ugrađene slike; nesigurni rezultati (logotipi, ukrasi) se odbacuju.
	async function prepoznajUgradjeno(platno, ctx) {
		var d = await ocr(platno, ctx);
		if ((d.confidence || 0) < MIN_POUZDANOST) return [];
		var odl = odlomciIzOcr(d.text || '');
		return brojSlova(odl.join('')) >= 3 ? odl : [];
	}

	// Slike iz ZIP paketa (docx, odt, xlsx, ods).
	async function slikeIzZipa(zip, uzorak, ctx) {
		var imena = Object.keys(zip.files).filter(function (n) {
			var m = /\.([a-z]+)$/i.exec(n);
			return uzorak.test(n) && m && SLIKA_MIME[m[1].toLowerCase()];
		}).sort(poBroju);
		var dijelovi = [], obradjeno = 0;
		for (var i = 0; i < imena.length; i++) {
			var ext = /\.([a-z]+)$/i.exec(imena[i])[1].toLowerCase();
			var blob = new Blob([await zip.file(imena[i]).async('arraybuffer')], { type: SLIKA_MIME[ext] });
			ctx.jedinica(i, imena.length);
			var sl = await pripremiSliku(blob);
			if (!sl || sl.sirina < MIN_SLIKA || sl.visina < MIN_SLIKA) continue;
			ctx.porukaOcr = 'Prepoznajem tekst na slici ' + (i + 1) + ' od ' + imena.length + '…';
			ctx.status(ctx.porukaOcr);
			var odl = await prepoznajUgradjeno(sl.platno, ctx);
			sl.platno.width = sl.platno.height = 0;
			obradjeno++;
			if (odl.length) dijelovi.push({ vrsta: 'slike', odlomci: odl });
		}
		ctx.jedinica(imena.length, imena.length); // sve slike pročitane
		return { dijelovi: dijelovi, obradjeno: obradjeno };
	}

	// Dodaje tekst sa slika dokumentu; greška OCR-a ne ruši brojanje ostatka teksta.
	async function dodajSlike(dijelovi, zip, uzorak, ctx) {
		if (!ctx.slike) return '';
		try {
			var r = await slikeIzZipa(zip, uzorak, ctx);
			Array.prototype.push.apply(dijelovi, r.dijelovi);
			return napomenaSlika(r.dijelovi.length, r.obradjeno);
		} catch (e) {
			return '; slike nisu obrađene: ' + ((e && e.message) || 'greška pri prepoznavanju teksta');
		}
	}

	function napomenaSlika(sTekstom, obradjeno) {
		if (!obradjeno || !sTekstom) return '';
		return '; tekst pronađen na ' + sTekstom + ' od ' + obradjeno + ' ' + mnozina(obradjeno, 'slike', 'slike', 'slika');
	}

	// Položaji slika na PDF stranici (u koordinatama iscrtane stranice).
	async function okviriSlikaPdf(stranica, pdfjs, vp) {
		var lista = await stranica.getOperatorList();
		var O = pdfjs.OPS, U = pdfjs.Util;
		var ctm = [1, 0, 0, 1, 0, 0], stog = [], okviri = [];
		for (var i = 0; i < lista.fnArray.length; i++) {
			var fn = lista.fnArray[i], a = lista.argsArray[i];
			if (fn === O.save) stog.push(ctm);
			else if (fn === O.restore) ctm = stog.pop() || [1, 0, 0, 1, 0, 0];
			else if (fn === O.transform) ctm = U.transform(ctm, a);
			else if (fn === O.paintFormXObjectBegin) { stog.push(ctm); if (a && a[0]) ctm = U.transform(ctm, a[0]); }
			else if (fn === O.paintFormXObjectEnd) ctm = stog.pop() || ctm;
			else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || (O.paintJpegXObject && fn === O.paintJpegXObject)) {
				var t = [[0, 0], [1, 0], [0, 1], [1, 1]].map(function (q) { return U.applyTransform(q, ctm); });
				var xs = t.map(function (q) { return q[0]; }), ys = t.map(function (q) { return q[1]; });
				var r = vp.convertToViewportRectangle([Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]);
				okviri.push({ x: Math.min(r[0], r[2]), y: Math.min(r[1], r[3]), w: Math.abs(r[2] - r[0]), h: Math.abs(r[3] - r[1]) });
			}
		}
		return okviri;
	}

	function imaVelikuSliku(okviri, vp) {
		var povrsina = vp.width * vp.height;
		return okviri.some(function (o) { return o.w * o.h > povrsina * 0.5; });
	}

	async function slikeSPdfStranice(stranica, pdfjs, ctx, brStranice, ukupnoStranica, vp, okviri) {
		var iscrtano = null, odlomci = [], obradjeno = 0, sTekstom = 0;
		var povrsina = vp.width * vp.height, vidjeno = {};
		for (var i = 0; i < okviri.length; i++) {
			var o = okviri[i];
			var x = Math.max(0, Math.floor(o.x)), y = Math.max(0, Math.floor(o.y));
			var w = Math.min(Math.floor(vp.width) - x, Math.ceil(o.w)), h = Math.min(Math.floor(vp.height) - y, Math.ceil(o.h));
			// Male slike se preskaču, a slike preko pola stranice su podloga (npr. sken ispod tekstnog sloja).
			if (w < MIN_SLIKA * 2 || h < MIN_SLIKA * 2 || w * h > povrsina * 0.5) continue;
			var kljuc = [x, y, w, h].join(',');
			if (vidjeno[kljuc]) continue;
			vidjeno[kljuc] = true;
			if (!iscrtano) iscrtano = await renderiraj(stranica, vp);
			var isj = document.createElement('canvas');
			isj.width = w;
			isj.height = h;
			isj.getContext('2d').drawImage(iscrtano, x, y, w, h, 0, 0, w, h);
			ctx.porukaOcr = 'Prepoznajem tekst na slikama, stranica ' + brStranice + ' od ' + ukupnoStranica + '…';
			ctx.status(ctx.porukaOcr);
			var odl = await prepoznajUgradjeno(isj, ctx);
			isj.width = isj.height = 0;
			obradjeno++;
			if (odl.length) { sTekstom++; Array.prototype.push.apply(odlomci, odl); }
		}
		if (iscrtano) iscrtano.width = iscrtano.height = 0;
		return { odlomci: odlomci, obradjeno: obradjeno, sTekstom: sTekstom };
	}

	/* ---------- Čitači po vrsti datoteke ---------- */
	// Svaki čitač vraća { odlomci: [...], napomena }. Odlomci se broje i upisuju u Word datoteku.

	async function citajPdf(datoteka, ctx) {
		var pdfjs = await ucitaj('pdf');
		pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
		var podaci = new Uint8Array(await datoteka.arrayBuffer());
		var doc;
		try {
			doc = await pdfjs.getDocument({ data: podaci }).promise;
		} catch (e) {
			if (e && e.name === 'PasswordException') throw new Error('PDF je zaštićen lozinkom. Otključajte ga i dodajte ponovno.');
			throw new Error('PDF se ne može otvoriti. Datoteka je možda oštećena.');
		}
		var brStr = doc.numPages, svi = [], ocrStr = 0, okrenuto = 0, slObr = 0, slTekst = 0, slGreska = '';
		for (var i = 1; i <= brStr; i++) {
			ctx.status('Čitam stranicu ' + i + ' od ' + brStr + '…');
			ctx.jedinica(i - 1, brStr);
			var str = await doc.getPage(i);
			var sadrzaj = await str.getTextContent();
			var odlomci = odlomciIzPdf(sadrzaj.items);

			var vp = vpZaStranicu(str);
			var okviri = null;
			var znTekst = zbrojiOdlomke(odlomci);

			// Skenirana stranica: nema tekstnog sloja, ili ga ima vrlo malo (npr. dodani broj stranice ili pečat)
			// preko slike koja prekriva veći dio stranice. Tada se cijela stranica prepoznaje OCR-om
			// i uzima se veći od dva rezultata.
			var skenirano = znTekst < 15;
			if (!skenirano && znTekst < 300) {
				try {
					okviri = await okviriSlikaPdf(str, pdfjs, vp);
					skenirano = imaVelikuSliku(okviri, vp);
				} catch (e) { okviri = []; }
			}

			if (skenirano) {
				ctx.porukaOcr = 'Prepoznajem tekst na skeniranoj stranici ' + i + ' od ' + brStr + '…';
				ctx.status(ctx.porukaOcr);
				var platno = await renderiraj(str, vp);
				var rez = await ocrOrijentirano(platno, ctx);
				platno.width = platno.height = 0;
				var prepoznato = odlomciIzOcr(rez.text || '');
				if (zbrojiOdlomke(prepoznato) > znTekst) {
					odlomci = prepoznato;
					ocrStr++;
					if (rez.kut) okrenuto++;
				}
			} else if (ctx.slike && !slGreska) {
				// Stranica s tekstom: po želji se prepoznaje i tekst na slikama na njoj.
				try {
					if (!okviri) okviri = await okviriSlikaPdf(str, pdfjs, vp);
					var sl = await slikeSPdfStranice(str, pdfjs, ctx, i, brStr, vp, okviri);
					slObr += sl.obradjeno;
					slTekst += sl.sTekstom;
					Array.prototype.push.apply(odlomci, sl.odlomci);
				} catch (e) {
					slGreska = (e && e.message) || 'greška pri prepoznavanju teksta';
				}
			}
			if (i > 1) svi.push(PRIJELOM);
			Array.prototype.push.apply(svi, odlomci);
			str.cleanup();
		}
		ctx.jedinica(brStr, brStr); // sve stranice pročitane
		doc.destroy();
		var napomena = brStr + ' ' + mnozina(brStr, 'stranica', 'stranice', 'stranica');
		if (ocrStr === brStr) napomena += ', skenirano (OCR)';
		else if (ocrStr > 0) napomena += ', od toga ' + ocrStr + ' skenirano (OCR)';
		if (okrenuto) napomena += ', ' + okrenuto + ' ' + mnozina(okrenuto, 'okrenuta stranica ispravljena', 'okrenute stranice ispravljene', 'okrenutih stranica ispravljeno');
		if (ctx.slike && ocrStr < brStr) napomena += slGreska ? '; slike nisu obrađene: ' + slGreska : napomenaSlika(slTekst, slObr);
		return { odlomci: svi, napomena: napomena, stranice: brStr };
	}

	function vpZaStranicu(stranica) {
		var osnovni = stranica.getViewport({ scale: 1 });
		return stranica.getViewport({ scale: Math.min(3, OCR_MAX_STRANA / Math.max(osnovni.width, osnovni.height)) });
	}

	async function renderiraj(stranica, vp) {
		var platno = document.createElement('canvas');
		platno.width = Math.floor(vp.width);
		platno.height = Math.floor(vp.height);
		var c = platno.getContext('2d');
		c.fillStyle = '#ffffff';
		c.fillRect(0, 0, platno.width, platno.height);
		await stranica.render({ canvasContext: c, viewport: vp }).promise;
		return platno;
	}

	/* --- Word i OpenDocument: broji se sve vidljivo (tijelo, zaglavlja, podnožja, tekstna polja, fusnote, SmartArt) --- */

	var NS = {
		w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
		mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
		a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
		text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
		office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
		style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
		draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0'
	};

	function djeca(n) {
		var r = [];
		for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) r.push(c);
		return r;
	}

	function parsirajXml(tekst) {
		var d = new DOMParser().parseFromString(tekst, 'application/xml');
		if (d.getElementsByTagName('parsererror').length) throw new Error('xml');
		return d;
	}

	async function otvoriZip(datoteka, poruka) {
		var JSZip = await ucitaj('jszip');
		try {
			return await JSZip.loadAsync(await datoteka.arrayBuffer());
		} catch (e) {
			throw new Error(poruka);
		}
	}

	function poBroju(a, b) {
		return (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0);
	}

	// Dijelovi dokumenta slažu se jedan za drugim, odvojeni prijelomom stranice u Word datoteci.
	// Isti blok (npr. identično zaglavlje na više vrsta stranica) broji se samo jednom.
	function spojiDijelove(dijelovi) {
		var odlomci = [], vidjeno = {}, nadjeno = [];
		dijelovi.forEach(function (d) {
			var sadrzaj = d.odlomci.filter(function (o) { return o.replace(/\s/g, '').length; });
			if (!sadrzaj.length) return;
			var kljuc = sadrzaj.join('\u0001');
			if (d.vrsta !== 'tijelo' && d.vrsta !== 'slike' && vidjeno[kljuc]) return;
			vidjeno[kljuc] = true;
			if (odlomci.length) odlomci.push(PRIJELOM);
			Array.prototype.push.apply(odlomci, d.odlomci.filter(function (o) { return o.length; }));
			if (d.vrsta !== 'tijelo' && d.vrsta !== 'slike' && nadjeno.indexOf(d.vrsta) < 0) nadjeno.push(d.vrsta);
		});
		return { odlomci: odlomci, nadjeno: nadjeno };
	}

	function napomenaDijelova(osnovno, nadjeno, tekstnaPolja) {
		var dodaci = nadjeno.slice();
		if (tekstnaPolja && dodaci.indexOf('tekstna polja') < 0) dodaci.push('tekstna polja');
		return dodaci.length ? osnovno + ' s dodacima: ' + dodaci.join(', ') : osnovno;
	}

	// DOCX: odlomci iz WordprocessingML-a.
	function docxSkriveno(r) {
		var rPr = djeca(r).filter(function (c) { return c.localName === 'rPr'; })[0];
		if (!rPr) return false;
		return djeca(rPr).some(function (c) {
			if (c.localName !== 'vanish') return false;
			var v = c.getAttributeNS(NS.w, 'val');
			return v !== 'false' && v !== '0' && v !== 'off';
		});
	}

	function docxOdlomci(korijen, odlomci, stat) {
		djeca(korijen).forEach(function (c) {
			if (c.namespaceURI === NS.mc && c.localName === 'Fallback') return;
			if (c.namespaceURI === NS.w) {
				if (c.localName === 'p') { docxOdlomak(c, odlomci, stat); return; }
				if (c.localName === 'del' || c.localName === 'moveFrom') return;
				if (c.localName === 'footnote' || c.localName === 'endnote') {
					var t = c.getAttributeNS(NS.w, 'type');
					if (t && t !== 'normal') return;
				}
			}
			docxOdlomci(c, odlomci, stat);
		});
	}

	function docxOdlomak(p, odlomci, stat) {
		var tekst = '', ugnijezdeno = [];
		(function obidi(n, skriveno) {
			djeca(n).forEach(function (c) {
				var ln = c.localName;
				if (c.namespaceURI === NS.mc && ln === 'Fallback') return;
				if (c.namespaceURI !== NS.w) { obidi(c, skriveno); return; }
				switch (ln) {
					case 'pPr': case 'rPr': case 'del': case 'moveFrom': case 'instrText': case 'delText': return;
					case 'r': obidi(c, skriveno || docxSkriveno(c)); return;
					case 't': if (!skriveno) tekst += c.textContent; return;
					case 'tab': if (!skriveno) tekst += '\t'; return;
					case 'br': case 'cr':
						var vr = c.getAttributeNS(NS.w, 'type');
						if (!skriveno && vr !== 'page' && vr !== 'column') tekst += '\n';
						return;
					case 'noBreakHyphen': if (!skriveno) tekst += '-'; return;
					case 'sym':
						if (!skriveno) {
							var kod = parseInt(c.getAttributeNS(NS.w, 'char'), 16);
							if (kod) tekst += String.fromCharCode(kod >= 0xF000 ? kod - 0xF000 : kod);
						}
						return;
					case 'txbxContent': ugnijezdeno.push(c); return;
					default: obidi(c, skriveno);
				}
			});
		})(p, false);
		if (tekst.length) odlomci.push(tekst);
		ugnijezdeno.forEach(function (t) {
			var prije = odlomci.length;
			docxOdlomci(t, odlomci, stat);
			if (odlomci.length > prije) stat.tekstnaPolja = true;
		});
	}

	// SmartArt i slični crteži (DrawingML).
	function drawingmlOdlomci(xml) {
		var odlomci = [];
		Array.prototype.forEach.call(xml.getElementsByTagNameNS(NS.a, 'p'), function (p) {
			var t = '';
			Array.prototype.forEach.call(p.getElementsByTagNameNS(NS.a, 't'), function (x) { t += x.textContent; });
			if (t.length) odlomci.push(t);
		});
		return odlomci;
	}

	async function citajDocx(datoteka, ctx) {
		var poruka = 'Word dokument se ne može pročitati. Datoteka je možda oštećena ili zaštićena lozinkom.';
		var zip = await otvoriZip(datoteka, poruka);
		var imena = Object.keys(zip.files);
		var glavni = imena.filter(function (n) { return /^word\/document\d*\.xml$/i.test(n); })[0];
		if (!glavni) throw new Error(poruka);

		var redoslijed = [
			{ vrsta: 'tijelo', uzorak: new RegExp('^' + glavni.replace('.', '\\.') + '$') },
			{ vrsta: 'zaglavlja', uzorak: /^word\/header\d*\.xml$/i },
			{ vrsta: 'podnožja', uzorak: /^word\/footer\d*\.xml$/i },
			{ vrsta: 'fusnote', uzorak: /^word\/footnotes\.xml$/i },
			{ vrsta: 'endnote', uzorak: /^word\/endnotes\.xml$/i },
			{ vrsta: 'SmartArt', uzorak: /^word\/diagrams\/drawing\d*\.xml$/i, drawingml: true }
		];
		var stat = { tekstnaPolja: false }, dijelovi = [];
		for (var i = 0; i < redoslijed.length; i++) {
			var r = redoslijed[i];
			var datoteke = imena.filter(function (n) { return r.uzorak.test(n); }).sort(poBroju);
			for (var j = 0; j < datoteke.length; j++) {
				var xml;
				try { xml = parsirajXml(await zip.file(datoteke[j]).async('string')); } catch (e) {
					if (r.vrsta === 'tijelo') throw new Error(poruka);
					continue;
				}
				var odl = [];
				if (r.drawingml) odl = drawingmlOdlomci(xml);
				else docxOdlomci(xml.documentElement, odl, stat);
				dijelovi.push({ vrsta: r.vrsta, odlomci: odl });
			}
		}
		var dodatak = await dodajSlike(dijelovi, zip, /^word\/media\//i, ctx);
		var spojeno = spojiDijelove(dijelovi);
		var stranice = null;
		try {
			var app = zip.file('docProps/app.xml');
			if (app) {
				var m = /<(?:\w+:)?Pages>\s*(\d+)\s*</.exec(await app.async('string'));
				if (m && +m[1] > 0) stranice = +m[1];
			}
		} catch (e) { /* procjena */ }
		return { odlomci: spojeno.odlomci, napomena: napomenaDijelova('Word dokument', spojeno.nadjeno, stat.tekstnaPolja) + dodatak, stranice: stranice };
	}

	// ODT: odlomci iz OpenDocument teksta.
	function odtOdlomci(korijen, odlomci, stat) {
		djeca(korijen).forEach(function (c) {
			if (c.namespaceURI === NS.text) {
				if (c.localName === 'p' || c.localName === 'h') { odtOdlomak(c, odlomci, stat); return; }
				if (c.localName === 'tracked-changes' || c.localName === 'note-citation') return;
			}
			if (c.namespaceURI === NS.office && (c.localName === 'annotation' || c.localName === 'annotation-end')) return;
			odtOdlomci(c, odlomci, stat);
		});
	}

	function odtOdlomak(p, odlomci, stat) {
		var tekst = '', ugnijezdeno = [], biljeske = [];
		(function obidi(n) {
			for (var c = n.firstChild; c; c = c.nextSibling) {
				if (c.nodeType === 3) { tekst += c.nodeValue.replace(/[ \t\r\n]+/g, ' '); continue; }
				if (c.nodeType !== 1) continue;
				var ns = c.namespaceURI, ln = c.localName;
				if (ns === NS.office && (ln === 'annotation' || ln === 'annotation-end')) continue;
				if (ns === NS.draw) { ugnijezdeno.push(c); continue; }
				if (ns === NS.text) {
					if (ln === 's') { tekst += new Array((parseInt(c.getAttributeNS(NS.text, 'c'), 10) || 1) + 1).join(' '); continue; }
					if (ln === 'tab') { tekst += '\t'; continue; }
					if (ln === 'line-break') { tekst += '\n'; continue; }
					if (ln === 'note') {
						djeca(c).forEach(function (x) { if (x.localName === 'note-body') biljeske.push(x); });
						continue;
					}
					if (ln === 'tracked-changes') continue;
				}
				obidi(c);
			}
		})(p);
		tekst = tekst.replace(/^ +/, '');
		if (tekst.length) odlomci.push(tekst);
		ugnijezdeno.forEach(function (d) {
			var prije = odlomci.length;
			odtOdlomci(d, odlomci, stat);
			if (odlomci.length > prije) stat.tekstnaPolja = true;
		});
		biljeske.forEach(function (b) {
			var prije = odlomci.length;
			odtOdlomci(b, odlomci, stat);
			if (odlomci.length > prije) stat.fusnote = true;
		});
	}

	async function citajOdt(datoteka, ctx) {
		var poruka = 'OpenDocument datoteka se ne može pročitati. Datoteka je možda oštećena ili zaštićena lozinkom.';
		var zip = await otvoriZip(datoteka, poruka);
		if (!zip.file('content.xml')) throw new Error(poruka);
		var stat = { tekstnaPolja: false, fusnote: false }, dijelovi = [];

		var sadrzaj;
		try { sadrzaj = parsirajXml(await zip.file('content.xml').async('string')); } catch (e) { throw new Error(poruka); }
		var tijelo = sadrzaj.getElementsByTagNameNS(NS.office, 'text')[0] || sadrzaj.documentElement;
		var odl = [];
		odtOdlomci(tijelo, odl, stat);
		dijelovi.push({ vrsta: 'tijelo', odlomci: odl });

		if (zip.file('styles.xml')) {
			try {
				var stilovi = parsirajXml(await zip.file('styles.xml').async('string'));
				Array.prototype.forEach.call(stilovi.getElementsByTagNameNS(NS.style, 'master-page'), function (mp) {
					djeca(mp).forEach(function (c) {
						if (c.namespaceURI !== NS.style || c.getAttributeNS(NS.style, 'display') === 'false') return;
						var vrsta = /^header/.test(c.localName) ? 'zaglavlja' : (/^footer/.test(c.localName) ? 'podnožja' : null);
						if (!vrsta) return;
						var o = [];
						odtOdlomci(c, o, stat);
						dijelovi.push({ vrsta: vrsta, odlomci: o });
					});
				});
			} catch (e) { /* bez zaglavlja i podnožja */ }
		}
		var dodatak = await dodajSlike(dijelovi, zip, /^Pictures\//, ctx);
		var spojeno = spojiDijelove(dijelovi);
		var nadjeno = spojeno.nadjeno;
		if (stat.fusnote) nadjeno.push('fusnote');
		var stranice = null;
		try {
			var meta = zip.file('meta.xml');
			if (meta) {
				var m = /page-count="(\d+)"/.exec(await meta.async('string'));
				if (m && +m[1] > 0) stranice = +m[1];
			}
		} catch (e) { /* procjena */ }
		return { odlomci: spojeno.odlomci, napomena: napomenaDijelova('OpenDocument tekst', nadjeno, stat.tekstnaPolja) + dodatak, stranice: stranice };
	}

	// Stari Word (.doc, Word 97–2003).
	function docRedci(tekst) {
		return String(tekst || '')
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
			.split(/\r\n|\r|\n/);
	}

	async function citajDoc(datoteka, ctx) {
		var citac = await ucitaj('worddoc');
		var r;
		try {
			r = await citac.procitaj(await datoteka.arrayBuffer());
		} catch (e) {
			throw new Error('Stari Word dokument (.doc) se ne može pročitati. Datoteka je možda oštećena ili zaštićena lozinkom. Pokušajte je spremiti kao .docx.');
		}
		var spojeno = spojiDijelove([
			{ vrsta: 'tijelo', odlomci: docRedci(r.tijelo) },
			{ vrsta: 'tekstna polja', odlomci: docRedci(r.tekstnaPolja) },
			{ vrsta: 'zaglavlja', odlomci: docRedci(r.zaglavlja) },
			{ vrsta: 'podnožja', odlomci: docRedci(r.podnozja) },
			{ vrsta: 'fusnote', odlomci: docRedci(r.fusnote) },
			{ vrsta: 'endnote', odlomci: docRedci(r.endnote) }
		]);
		var napomena = napomenaDijelova('Word 97–2003 dokument', spojeno.nadjeno, false);
		if (ctx && ctx.slike) napomena += '; slike u starom .doc formatu se ne obrađuju (spremite kao .docx)';
		return { odlomci: spojeno.odlomci, napomena: napomena };
	}

	async function citajTablicu(datoteka, ctx) {
		var XLSX = await ucitaj('xlsx');
		var wb, podaci = await datoteka.arrayBuffer();
		try {
			wb = XLSX.read(podaci, { type: 'array' });
		} catch (e) {
			throw new Error('Tablica se ne može pročitati. Datoteka je možda oštećena ili zaštićena lozinkom.');
		}
		var odlomci = [], celija = 0;
		wb.SheetNames.forEach(function (ime, i) {
			var list = wb.Sheets[ime];
			var tekstovi = [];
			XLSX.utils.sheet_to_json(list, { header: 1, raw: false, defval: '' }).forEach(function (red) {
				red.forEach(function (v) {
					var t = String(v == null ? '' : v).trim();
					if (t) { tekstovi.push(t); celija++; }
				});
			});
			if (tekstovi.length) {
				if (odlomci.length) odlomci.push(PRIJELOM);
				Array.prototype.push.apply(odlomci, tekstovi);
			}
		});
		var n = wb.SheetNames.length;
		var dodatak = '';
		if (ctx.slike && prihvacaSlike({ vrsta: 'tablica', ime: datoteka.name })) {
			try {
				var zip = await (await ucitaj('jszip')).loadAsync(podaci);
				var dijelovi = [];
				dodatak = await dodajSlike(dijelovi, zip, /^(xl\/media|Pictures)\//, ctx);
				dijelovi.forEach(function (d) { odlomci.push(PRIJELOM); Array.prototype.push.apply(odlomci, d.odlomci); });
			} catch (e) {
				dodatak = '; slike nisu obrađene';
			}
		}
		return {
			odlomci: odlomci,
			napomena: n + ' ' + mnozina(n, 'list', 'lista', 'listova') + ', ' + fmt(celija, 0) + ' ' + mnozina(celija, 'ćelija', 'ćelije', 'ćelija') + ' s tekstom' + dodatak
		};
	}

	async function citajTxt(datoteka) {
		var odlomci = (await datoteka.text()).split(/\r\n|\r|\n/).filter(function (o) { return o.length; });
		return { odlomci: odlomci, napomena: 'Tekstna datoteka' };
	}

	async function citajSliku(datoteka, ctx) {
		ctx.porukaOcr = 'Prepoznajem tekst na slici…';
		ctx.status(ctx.porukaOcr);
		var sl = await pripremiSliku(datoteka);
		if (!sl) return { odlomci: odlomciIzOcr(await ocrTekst(datoteka, ctx)), napomena: 'Slika (OCR)', stranice: 1 };
		var rez = await ocrOrijentirano(sl.platno, ctx);
		ctx.jedinica(1, 1); // slika pročitana
		sl.platno.width = sl.platno.height = 0;
		return { odlomci: odlomciIzOcr(rez.text || ''), napomena: 'Slika (OCR)' + (rez.kut ? ', okrenuta slika ispravljena' : ''), stranice: 1 };
	}

	var CITACI = { pdf: citajPdf, docx: citajDocx, doc: citajDoc, odt: citajOdt, tablica: citajTablicu, txt: citajTxt, slika: citajSliku };

	/* ---------- Standardni dijelovi dokumenata ---------- */
	// Popis se može proširivati. "prepoznaj": sve fraze moraju postojati u tekstu (zanemaruju se velika i
	// mala slova i dijakritici, a dopuštene su sitne greške OCR-a).
	// "obracun": 'fiksno' = cijeli blok se izuzima iz brojanja i obračunava kao "kartice";
	//            'bezKoda' = blok se broji, ali bez koda elektroničkog pečata.
	// "oznake": izrazi koji pripadaju bloku; blok obuhvaća sve oznake blizu "sidra" (za način 'fiksno').

	var STANDARDNI_DIJELOVI = [
		{
			naziv: 'e-ovjera Ministarstva pravosuđa',
			prepoznaj: ['elektronički pečat', 'izdavatelj certifikata'],
			obracun: 'fiksno',
			postavka: 'eovjera',
			kartice: 0.5,
			sidro: 'elektronički pečat',
			oznake: [
				'r e p u b l i k a h r v a t s k a',
				'ministarstvo pravosuđa, uprave i digitalne transformacije',
				'vrijeme izdavanja', 'izdavatelj certifikata', 'cn=ematicnidokumenti',
				'serijski broj', 'algoritam potpisa', 'broj zapisa', 'kontrolni broj',
				'elektronički pečat', 'informacije za provjeru', 'edokumentiprovjera',
				'elektronički zapisi se čuvaju', 'putem internet adrese',
				'certifikatom ministarstva pravosuđa, uprave i digitalne transformacije',
				{ izraz: 'napomena', blizina: 60 },
				{ uzorak: /[A-Za-z0-9+\/=]{40,}/g }   // kod elektroničkog pečata
			]
		},
		{
			// Elektronički potpis: tablica s podacima o certifikatu (Porezna uprava, ministarstva i druga tijela
			// s potpisom Fina certifikatom). Prepoznaje se po tri oznake polja; blok pronalazi nadjiBlokCertifikata.
			naziv: 'elektronički potpis (tablica s certifikatom)',
			prepoznato: 'prepoznat',
			prepoznaj: ['vrijeme izdavanja', 'izdavatelj certifikata', 'naziv certifikata'],
			obracun: 'fiksno',
			postavka: 'epotpis',
			kartice: 0.5,
			nadji: nadjiBlokCertifikata
		}
	];

	// Normalizacija koja čuva duljinu teksta (svaki znak ostaje jedan znak), pa se položaji podudaraju.
	function normalizirajIstoDugo(t) {
		var r = '';
		for (var i = 0; i < t.length; i++) {
			var c = t.charAt(i);
			r += c === 'đ' || c === 'Đ' ? 'd' : (c.normalize('NFD').charAt(0).toLowerCase().charAt(0) || c);
		}
		return r;
	}

	// Svi položaji izraza; ako ga nema točno, traži se jedno približno podudaranje (greške OCR-a).
	function pozicije(norm, izraz) {
		var r = [], i = norm.indexOf(izraz);
		while (i >= 0) { r.push({ od: i, do: i + izraz.length }); i = norm.indexOf(izraz, i + 1); }
		if (r.length) return r;
		var m = izraz.length, maxGr = Math.floor(m / 8);
		if (!maxGr) return r;
		var preth = new Array(m + 1), tren = new Array(m + 1), j, najbolje = maxGr + 1, kraj = -1;
		for (j = 0; j <= m; j++) preth[j] = j;
		for (var k = 1; k <= norm.length; k++) {
			tren[0] = 0;
			var c = norm.charCodeAt(k - 1);
			for (j = 1; j <= m; j++) tren[j] = Math.min(preth[j] + 1, tren[j - 1] + 1, preth[j - 1] + (izraz.charCodeAt(j - 1) === c ? 0 : 1));
			if (tren[m] < najbolje) { najbolje = tren[m]; kraj = k; }
			var t = preth; preth = tren; tren = t;
		}
		if (kraj >= 0) r.push({ od: Math.max(0, kraj - m), do: kraj });
		return r;
	}

	// Pronalazi jedan blok (npr. e-ovjeru): od sidra se šire granice na sve oznake bloka u blizini.
	function nadjiBlok(tekst, d) {
		var norm = normalizirajIstoDugo(tekst);
		var sidra = pozicije(norm, normalizirajIstoDugo(d.sidro));
		if (!sidra.length) return null;
		var od = sidra[0].od, kraj = sidra[0].do, pojave = [];
		// Blok ne prelazi granicu stranice (prijelom je zabilježen kao \u0002).
		var granicaOd = tekst.lastIndexOf('\u0002', od) + 1;
		var granicaDo = tekst.indexOf('\u0002', kraj);
		if (granicaDo < 0) granicaDo = tekst.length;
		d.oznake.forEach(function (o) {
			var blizina = typeof o === 'string' || !o.blizina ? 450 : o.blizina;
			if (o.uzorak) {
				var m, re = new RegExp(o.uzorak.source, 'g');
				while ((m = re.exec(tekst))) pojave.push({ od: m.index, do: m.index + m[0].length, blizina: blizina });
				return;
			}
			var izraz = typeof o === 'string' ? o : o.izraz;
			pozicije(norm, normalizirajIstoDugo(izraz)).forEach(function (p) { p.blizina = blizina; pojave.push(p); });
		});
		pojave = pojave.filter(function (p) { return p.od >= granicaOd && p.do <= granicaDo; });
		var promjena = true;
		while (promjena) {
			promjena = false;
			pojave.forEach(function (p) {
				if (p.od >= od && p.do <= kraj) return;
				if (p.od <= kraj + p.blizina && p.do >= od - p.blizina) {
					od = Math.min(od, p.od);
					kraj = Math.max(kraj, p.do);
					promjena = true;
				}
			});
		}
		// Završetak bloka: vrijednost iza zadnje oznake do kraja retka (npr. kontrolni broj).
		var ostatak = tekst.slice(kraj).match(/^[^\n]*?(?=\s+\d{4}-\d{4}-\d{5}\s+Stranica|\n|$)/);
		if (ostatak && ostatak[0].length < 140 && /^[\s:]*[\d.:\- ]*$/.test(ostatak[0])) kraj += ostatak[0].length;
		return { od: od, do: kraj };
	}

	// Oznake polja i izrazi iz pojašnjenja uz tablicu s podacima o certifikatu (bez dijakritika, malim slovima).
	var OZNAKE_CERTIFIKATA = ['vrijeme izdavanja', 'izdavatelj certifikata', 'naziv certifikata', 'serijski broj',
		'algoritam potpisa', 'broj zapisa', 'kontrolni broj', 'serialnumber', 'sha256'];
	var POJASNJENJE_CERTIFIKATA = ['provjer', 'qr', 'internet adres', 'elektronick', 'certifikat', 'potvrduje tocnost',
		'identicn', 'izvornik', 'broja zapisa', 'kontrolnog broja', 'potpis', 'pecat', 'digitaln'];

	function sadrziOznaku(norm, popis) {
		return popis.filter(function (z) { return norm.indexOf(z) >= 0; }).length;
	}

	// Pronalazi cijelu tablicu s certifikatom: sidro je "Vrijeme izdavanja"; blok obuhvaća odlomke s oznakama polja
	// i pojašnjenjima iza njega (QR kod, upute za provjeru, izjava tijela) te logotipski tekst ispred njega
	// (npr. „REPUBLIKA HRVATSKA / MINISTARSTVO …"). Ne prelazi granicu stranice.
	function nadjiBlokCertifikata(tekst) {
		var norm = normalizirajIstoDugo(tekst);
		var sidra = pozicije(norm, 'vrijeme izdavanja');
		if (!sidra.length) return null;

		// Odlomci s položajima (odvojeni znakom \n; prijelom stranice je zaseban odlomak \u0002).
		var odl = [], poc = 0;
		tekst.split('\n').forEach(function (t) {
			odl.push({ od: poc, do: poc + t.length, t: t, n: norm.slice(poc, poc + t.length) });
			poc += t.length + 1;
		});
		var i0 = -1;
		odl.forEach(function (o, i) { if (i0 < 0 && sidra[0].od >= o.od && sidra[0].od <= o.do) i0 = i; });
		if (i0 < 0 || odl[i0].t === '\u0002') return null;

		var prvi = i0, zadnji = i0;
		// Naprijed: odlomci s oznakama polja ili pojašnjenjem (najviše 12), do prijeloma stranice.
		for (var j = i0 + 1; j < odl.length && j <= i0 + 12; j++) {
			var o = odl[j];
			if (o.t === '\\u0002') break;
			var jeOznaka = sadrziOznaku(o.n, OZNAKE_CERTIFIKATA) >= 1;
			var jePojasnjenje = o.t.length <= 700 && sadrziOznaku(o.n, POJASNJENJE_CERTIFIKATA) >= 2;
			if (!jeOznaka && !jePojasnjenje) break;
			zadnji = j;
		}
		var od, kraj = odl[zadnji].do;
		var prije = tekst.slice(odl[i0].od, sidra[0].od);
		if (prije.replace(/\\s+/g, '') === '') {
			// Sidro je na početku odlomka (digitalni PDF): natrag najviše dva kratka odlomka velikih slova (logotipski tekst).
			od = odl[i0].od;
			for (var k = i0 - 1; k >= 0 && k >= i0 - 2; k--) {
				var t = odl[k].t;
				if (t === '\\u0002' || t.length > 200 || t.length < 4) break;
				var slova = t.replace(/[^A-Za-zČĆŽŠĐčćžšđ]/g, '');
				var velika = slova.replace(/[^A-ZČĆŽŠĐ]/g, '');
				if (slova.length < 4 || velika.length / slova.length < 0.6) break;
				od = odl[k].od;
			}
		} else {
			// Sidro je usred odlomka (npr. OCR je spojio cijelu stranicu): blok počinje od zadnjeg niza riječi velikim
			// slovima neposredno ispred sidra (logotipski tekst), a ne od početka odlomka, da običan tekst ostane u brojanju.
			var rijeci = prije.replace(/\\s+$/, '').split(/(\\s+)/);
			var duljina = prije.length - prije.replace(/\\s+$/, '').length;
			for (var r = rijeci.length - 1; r >= 0; r--) {
				var w = rijeci[r];
				if (/^\\s*$/.test(w)) { duljina += w.length; continue; }
				var sl = w.replace(/[^A-Za-zČĆŽŠĐčćžšđ]/g, '');
				if (sl.length && sl !== sl.toUpperCase()) break; // riječ s malim slovima: kraj logotipskog teksta
				duljina += w.length;
			}
			od = sidra[0].od - duljina;
			// Spojeni odlomak: blok traje najviše oko 1150 znakova od sidra (do kraja rečenice), ostalo je običan tekst.
			if (kraj - sidra[0].od > 1150) {
				var rez = tekst.indexOf('. ', sidra[0].od + 1150);
				kraj = rez >= 0 && rez - (sidra[0].od + 1150) <= 120 ? rez + 1 : sidra[0].od + 1150;
			}
		}
		// Predugo za pravu tablicu (npr. OCR je spojio cijelu stranicu u jedan odlomak): ne diraj.
		if (kraj - od > 2500) return null;
		// Prava tablica ima i druga polja (algoritam potpisa, broj zapisa, kontrolni broj…), ne samo tri oznake
		// u običnoj rečenici: u bloku mora biti najmanje četiri različite oznake polja.
		var blokNorm = norm.slice(od, kraj);
		if (OZNAKE_CERTIFIKATA.filter(function (z) { return blokNorm.indexOf(z) >= 0; }).length < 4) return null;
		return { od: od, do: kraj };
	}

	function izdvojiBlokove(odlomci, d) {
		// Odlomci se spajaju u jedan tekst; prijelomi stranica bilježe se kao \u0002 da se mogu vratiti.
		var tekst = '', broj = 0;
		odlomci.forEach(function (o, i) {
			if (i) tekst += '\n';
			tekst += typeof o === 'string' ? o : '\u0002';
		});
		for (var n = 0; n < 50; n++) {
			var b = (d.nadji || nadjiBlok)(tekst, d);
			if (!b) break;
			var izrez = tekst.slice(b.od, b.do);
			var cuvaj = izrez.replace(/[^\n\u0002]/g, '').replace(/\n+/g, '\n');
			tekst = tekst.slice(0, b.od) + cuvaj + tekst.slice(b.do);
			broj++;
		}
		if (!broj) return null;
		var novi = tekst.split('\n').map(function (o) {
			if (o === '\u0002') return PRIJELOM;
			return o.replace(/\u0002/g, '').replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');
		}).filter(function (o) { return typeof o !== 'string' || o.length; });
		var prije = zbrojiOdlomke(odlomci), poslije = zbrojiOdlomke(novi);
		return { odlomci: novi, broj: broj, izuzeto: prije - poslije };
	}

	function normaliziraj(t) {
		return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.replace(/đ/g, 'd').replace(/\s+/g, ' ');
	}

	// Traži frazu u tekstu uz najviše nekoliko pogrešnih, dodanih ili izostavljenih znakova.
	function sadrziPriblizno(tekst, fraza) {
		if (tekst.indexOf(fraza) >= 0) return true;
		var m = fraza.length, maxGr = Math.floor(m / 8);
		if (!maxGr) return false;
		var preth = new Array(m + 1), tren = new Array(m + 1), j;
		for (j = 0; j <= m; j++) preth[j] = j;
		for (var i = 1; i <= tekst.length; i++) {
			tren[0] = 0;
			var c = tekst.charCodeAt(i - 1);
			for (j = 1; j <= m; j++) {
				tren[j] = Math.min(preth[j] + 1, tren[j - 1] + 1, preth[j - 1] + (fraza.charCodeAt(j - 1) === c ? 0 : 1));
			}
			if (tren[m] <= maxGr) return true;
			var t = preth; preth = tren; tren = t;
		}
		return false;
	}

	// Kod elektroničkog pečata: dugi niz znakova Base64 (slova, brojke, + / =), često prelomljen u više redaka.
	// Jezgra su dulji komadi s brojkama te velikim i malim slovima; tome se pridružuju susjedni kraći komadi
	// koji izgledaju kao isti kod (npr. "vABQQ", "iTuX+FZpu"), a obične riječi ostaju.
	function jeBase64(t) { return /^[A-Za-z0-9+\/=]+$/.test(t); }
	function jezgraKoda(t) {
		return jeBase64(t) && t.length >= 16 && /[0-9]/.test(t) && /[A-Z]/.test(t) && /[a-z]/.test(t) &&
			!/[0-9]{8,}/.test(t) && (t.match(/[a-z][A-Z]|[A-Z][a-z]/g) || []).length >= 4;
	}
	function nalikKodu(t) { return jeBase64(t) && (/[0-9+\/=]/.test(t) || /[a-z][A-Z]/.test(t)); }

	function ukloniKodPecata(tekst) {
		var d = String(tekst).split(/(\s+)/), rijeci = [], k;
		for (var i = 0; i < d.length; i += 2) rijeci.push(d[i]);
		var oznaceno = rijeci.map(jezgraKoda);
		if (oznaceno.indexOf(true) < 0) return { tekst: tekst, uklonjeno: 0 };
		var promjena = true;
		while (promjena) {
			promjena = false;
			for (k = 0; k < rijeci.length; k++) {
				if (!oznaceno[k] && nalikKodu(rijeci[k]) && (oznaceno[k - 1] || oznaceno[k + 1])) { oznaceno[k] = true; promjena = true; }
			}
		}
		var duljina = 0;
		for (k = 0; k < rijeci.length; k++) if (oznaceno[k]) duljina += rijeci[k].length;
		if (duljina < 40) return { tekst: tekst, uklonjeno: 0 };

		var novi = '';
		for (k = 0; k < rijeci.length; k++) {
			if (oznaceno[k]) continue;
			novi += rijeci[k] + (k * 2 + 1 < d.length ? d[k * 2 + 1] : '');
		}
		novi = novi.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');
		return { tekst: novi, uklonjeno: brojiZnakove(tekst) - brojiZnakove(novi) };
	}

	function karticeTekst(k) {
		if (Math.abs(k - Math.round(k)) < 1e-9) return fmt(k, 0) + ' ' + mnozina(Math.round(k), 'kartica', 'kartice', 'kartica');
		return fmt(k, 2).replace(/0$/, '') + ' kartice';
	}

	function primijeniStandardneDijelove(odlomci) {
		var cijeli = normaliziraj(odlomci.filter(function (o) { return typeof o === 'string'; }).join(' '));
		var napomena = '', fiksno = 0;
		STANDARDNI_DIJELOVI.forEach(function (d) {
			var prepoznat = d.prepoznaj.every(function (f) { return sadrziPriblizno(cijeli, normaliziraj(f)); });
			if (!prepoznat) return;
			if (d.obracun === 'fiksno') {
				var b = izdvojiBlokove(odlomci, d);
				if (b) {
					odlomci = b.odlomci;
					fiksno += b.broj * d.kartice;
					napomena += '; ' + (d.prepoznato || 'prepoznata') + ' ' + d.naziv + (b.broj > 1 ? ' (' + b.broj + '×)' : '') +
						': obračunato ' + karticeTekst(b.broj * d.kartice) + ' umjesto ' +
						fmt(b.izuzeto, 0) + ' ' + mnozina(b.izuzeto, 'znaka', 'znaka', 'znakova');
					return;
				}
				if (d.nadji) return; // blok nije pronađen: tekst se broji normalno
			}
			var ukupnoUklonjeno = 0;
			if (d.obracun === 'bezKoda' || d.obracun === 'fiksno') {
				odlomci = odlomci.map(function (o) {
					if (typeof o !== 'string') return o;
					var r = ukloniKodPecata(o);
					ukupnoUklonjeno += r.uklonjeno;
					return r.tekst;
				}).filter(function (o) { return typeof o !== 'string' || o.length; });
			}
			napomena += '; prepoznata ' + d.naziv;
			if (ukupnoUklonjeno) napomena += ', kod elektroničkog pečata nije brojan (' + fmt(ukupnoUklonjeno, 0) + ' ' + mnozina(ukupnoUklonjeno, 'znak', 'znaka', 'znakova') + ')';
		});
		return { odlomci: odlomci, napomena: napomena, fiksno: fiksno };
	}

	/* ---------- Prepoznavanje stručnih tekstova ---------- */
	// Za svako područje popis izraza (hrvatski, njemački, engleski). Tekst se prije usporedbe piše malim
	// slovima i bez dijakritika (č → c, ä → a, ß → ss). Zvjezdica na kraju znači "bilo koji nastavak"
	// (dijagnoz* = dijagnoza, dijagnoze, dijagnozom...). "uzorci" su regularni izrazi za oznake i jedinice.
	// Dokument je stručni kad za jedno područje ima barem MIN_RAZLICITIH različitih izraza i kad stručni
	// izrazi čine barem MIN_GUSTOCA posto riječi.

	var STRUCNA_PODRUCJA = [
		{
			kljuc: 'medicina', naziv: 'medicina',
			izrazi: [
				// hrvatski
				'dijagnoz*', 'anamnez*', 'terapij*', 'otpusn* pism*', 'nalaz*', 'lijecnik*', 'lijecnick*', 'bolnic*',
				'klinik*', 'klinick*', 'pacijent*', 'bolesnik*', 'simptom*', 'laboratorij*', 'krvni tlak', 'hipertenzij*',
				'dijabetes*', 'kirurs*', 'operacij*', 'tablet*', 'dozir*', 'hemoglobin*', 'leukocit*', 'eritrocit*',
				'trombocit*', 'infekcij*', 'fraktur*', 'epikriz*', 'hospitaliz*', 'status praesens', 'lokalni status',
				'ekg', 'uzv', 'mkb', 'specijalist*', 'ambulant*', 'lijek*', 'kronicn*', 'akutn*', 'upal*', 'bolest*',
				// njemački
				'diagnos*', 'anamnes*', 'therapie*', 'arztbrief*', 'entlassungsbrief*', 'befund*', 'patient*',
				'krankenhaus*', 'symptom*', 'labor*', 'blutdruck*', 'hypertonie*', 'diabetes*', 'medikament*',
				'medikation*', 'dosierung*', 'tablette*', 'operation*', 'infektion*', 'epikrise*', 'entlassung*',
				'sonograph*', 'rontgen*', 'hamoglobin*', 'leukozyt*', 'erythrozyt*', 'thrombozyt*', 'facharzt*',
				'stationar*', 'chronisch*', 'akut*', 'entzundung*', 'krankheit*', 'arztlich*',
				// njemački – liječnici, ustanove i izvješća (složenice se navode zasebno, jer "therapie*" ne
				// prepoznaje "Physiotherapie")
				'arzt', 'arztin', 'arzte*', 'hausarzt*', 'kinderarzt*', 'zahnarzt*', 'arztpraxis*', 'ordination*',
				'ambulanz*', 'notaufnahme*', 'intensivstation*', 'klinikum*', 'universitatsklinik*',
				'arztbericht*', 'befundbericht*', 'entlassungsbericht*', 'operationsbericht*', 'op-bericht*',
				'behandlung*', 'heilbehandlung*', 'behandlungsnachweis*', 'behandlungsbericht*', 'behandlungsplan*',
				'behandlungsdauer*', 'behandlungstermin*', 'nachbehandlung*',
				// njemački – terapije i propisivanje
				'physiotherap*', 'ergotherap*', 'logopad*', 'psychotherap*', 'krankengymnastik*', 'manuelle therapie',
				'lymphdrainage*', 'heilmittel*', 'heilmittelverordnung*', 'arztliche verordnung', 'rezept*', 'medikationsplan*',
				'wirkstoff*', 'nebenwirkung*', 'rehabilitation*', 'reha-*', 'kuraufenthalt*',
				// njemački – pretrage i nalazi
				'mrt', 'kernspin*', 'computertomograph*', 'ultraschall*', 'blutbild*', 'blutwert*', 'laborwert*',
				'laborbefund*', 'blutzucker*', 'cholesterin*', 'urinbefund*', 'icd', 'icd-10', 'impf*', 'impfpass*',
				'impfnachweis*',
				// njemački – bolovanje, njega, osiguranje
				'arbeitsunfahig*', 'au-bescheinigung*', 'krankmeldung*', 'krankschreibung*', 'attest*',
				'pflegegrad*', 'pflegegutachten*', 'pflegedienst*', 'krankenkasse*', 'krankenversicherung*',
				'versichertennummer*', 'kostentrager*', 'mutterpass*', 'schwangerschaft*',
				// njemački – specijalnosti i tegobe
				'orthopad*', 'kardiolog*', 'neurolog*', 'internist*', 'chirurg*', 'gynakolog*', 'urolog*',
				'dermatolog*', 'radiolog*', 'psychiatr*', 'kieferorthop*', 'schmerz*', 'verletzung*',
				// engleski
				'diagnos*', 'therap*', 'discharge summar*', 'discharge letter', 'medical report', 'clinical',
				'hospital*', 'laborator*', 'blood pressure', 'hypertension', 'medication*', 'dosage*', 'surgery',
				'surgical', 'fracture*', 'infection*', 'ecg', 'ultrasound', 'x-ray', 'hemoglobin*', 'leukocyte*',
				'platelet*', 'chronic', 'acute', 'inflammation', 'disease*', 'physician*'
			],
			uzorci: [
				/\b\d+([.,]\d+)?\s?(mg|mcg|ml|mmol\/l|mg\/dl|g\/l|iu|ie)\b/g,   // doze i laboratorijske jedinice
				/\b[a-z]\d{2}\.\d{1,2}\b/g                                       // šifre bolesti (MKB/ICD), npr. i10.0
			]
		},
		{
			// Računi zubara, liječnika, bolnica i sl.: uz medicinske izraze mora postojati i izraz za račun.
			kljuc: 'racuni', naziv: 'medicinski račun', prednost: true, minRazlicitih: 3,
			obavezno: [
				'racun', 'racuna', 'racunu', 'r1 racun', 'faktur*', 'predracun*', 'troskovnik*',
				'rechnung*', 'privatrechnung*', 'arztrechnung*', 'zahnarztrechnung*', 'krankenhausrechnung*',
				'kostenvoranschlag*', 'heil- und kostenplan*', 'liquidation*', 'honorarnote*', 'quittung*',
				'invoice*', 'medical bill', 'cost estimate'
			],
			izrazi: [
				// hrvatski
				'stomatolog*', 'zubar*', 'zubn*', 'dentaln*', 'ordinacij*', 'poliklinik*', 'bolnic*', 'klinik*',
				'lijecnik*', 'lijecnick*', 'specijalist*', 'specijalisticki pregled*', 'kontrolni pregled*', 'zahvat*',
				'plomb*', 'ispun*', 'ekstrakcij*', 'vadenje zub*', 'implantat*', 'protez*', 'krunic*', 'zubni most*',
				'endodont*', 'karijes*', 'parodont*',
				'rtg', 'ortopan*', 'anestezij*', 'terapij*', 'hzzo', 'dopunsk* osiguranj*', 'pacijent*', 'usluga pregleda',
				// njemački
				'zahnarzt*', 'zahnarztlich*', 'zahnklinik*', 'zahnarztpraxis*', 'arztpraxis*', 'behandlung*', 'fullung*',
				'extraktion*', 'zahnersatz*', 'zahnkrone*', 'zahnbrucke*', 'wurzelbehandlung*', 'karies*', 'parodont*',
				'implantat*', 'anasthesie*', 'goa', 'goz', 'gebuhrenordnung*', 'krankenkasse*',
				'krankenversicherung*', 'patient*', 'untersuchung*', 'rontgen*', 'facharzt*', 'krankenhaus*',
				'arzt', 'arztin', 'ordination*', 'ambulanz*', 'therapie*', 'physiotherap*', 'krankengymnastik*',
				'lymphdrainage*', 'heilmittel*', 'massage*', 'behandlungsnachweis*', 'heilmittelverordnung*',
				// engleski
				'dentist*', 'dental', 'clinic*', 'hospital*', 'physician*', 'treatment*', 'filling*', 'extraction*',
				'implant*', 'crown*', 'root canal', 'denture*', 'anesthe*', 'x-ray', 'consultation*', 'health insurance'
			],
		},
		{
			kljuc: 'tehnika', naziv: 'tehnika',
			izrazi: [
				// hrvatski
				'tehnick* list*', 'sigurnosno-tehnick*', 'specifikacij*', 'tehnick* podac*', 'tehnick* karakteristik*',
				'napon*', 'nazivn*', 'zastitn* razred*', 'materijal*', 'dimenzij*', 'promjer*', 'toleranc*',
				'montaz*', 'odrzavanj*', 'upute za uporabu', 'hidraul*', 'pneumat*', 'lezaj*', 'okretn* moment*',
				'elektricn*', 'strojn*', 'tlak*', 'temperatur*', 'kapacitet*', 'snaga motor*',
				// njemački
				'technisch* datenblatt*', 'datenblatt*', 'sicherheitsdatenblatt*', 'spezifikation*', 'technische daten',
				'nennspannung*', 'spannung*', 'schutzart*', 'werkstoff*', 'abmessung*', 'durchmesser*', 'toleranz*',
				'montage*', 'wartung*', 'betriebsanleitung*', 'bedienungsanleitung*', 'hydraul*', 'pneumat*',
				'drehmoment*', 'nennleistung*', 'betriebstemperatur*', 'elektrisch*', 'maschine*',
				// engleski
				'data sheet', 'datasheet*', 'safety data sheet', 'specification*', 'technical data', 'rated voltage',
				'voltage*', 'power consumption', 'protection class', 'dimension*', 'diameter*', 'tolerance*',
				'installation*', 'maintenance', 'operating instructions', 'torque*', 'operating temperature'
			],
			uzorci: [
				/\b(en|iso|din|iec|astm|hrn)\s?(en\s?)?\d{3,5}\b/g,                         // norme
				/\b\d+([.,]\d+)?\s?(kw|kva|kwh|mm|nm|n\/mm2|bar|mpa|kpa|hz|rpm|°c|w|v|db)\b/g, // mjerne jedinice
				/\bip\s?[0-6][0-9]\b/g                                                     // stupanj zaštite
			]
		},
		{
			kljuc: 'certifikati', naziv: 'certifikati i ispitivanja',
			izrazi: [
				'izjav* o sukladnosti', 'sukladnost*', 'certifikat*', 'akreditacij*', 'akreditiran*', 'ispitn* izvjesc*',
				'ispitivanj*', 'ce oznak*', 'nadzorn* tijel*', 'ovlasten* tijel*',
				'konformitatserklarung*', 'zertifikat*', 'zertifiziert*', 'akkreditier*', 'prufbericht*', 'prufung*',
				'benannte stelle',
				'declaration of conformity', 'certificate*', 'certified', 'accredit*', 'test report*', 'conformity',
				'notified body', 'compliance'
			],
			uzorci: [
				/\b(en|iso|din|iec|hrn)\s?(en\s?)?\d{3,5}\b/g
			]
		}
	];
	var STRUCNO_MIN_RAZLICITIH = 4;
	var STRUCNO_MIN_GUSTOCA = 1.5; // posto riječi

	function normalizirajZaStrucno(t) {
		return String(t).toLowerCase().replace(/ß/g, 'ss').replace(/đ/g, 'd')
			.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
	}

	// Izrazi se pretvaraju u regularne izraze samo jednom.
	STRUCNA_PODRUCJA.forEach(function (p) {
		var vidjeni = {};
		p.regexi = [];
		p.izrazi.forEach(function (iz) {
			if (vidjeni[iz]) return;
			vidjeni[iz] = true;
			var izvor = iz.replace(/[.+?^${}()|[\]\\\/]/g, '\\$&').replace(/\*/g, '[a-z0-9]*').replace(/ /g, '\\s+');
			p.regexi.push(new RegExp('\\b' + izvor + (iz.slice(-1) === '*' ? '' : '\\b'), 'g'));
		});
		(p.uzorci || []).forEach(function (u) { p.regexi.push(new RegExp(u.source, 'g')); });
		p.obavezniRegexi = (p.obavezno || []).map(function (iz) {
			var izvor = iz.replace(/[.+?^${}()|[\]\\\/]/g, '\\$&').replace(/\*/g, '[a-z0-9]*').replace(/ /g, '\\s+');
			return new RegExp('\\b' + izvor + (iz.slice(-1) === '*' ? '' : '\\b'));
		});
	});

	function prepoznajStrucno(odlomci) {
		var tekst = normalizirajZaStrucno(odlomci.filter(function (o) { return typeof o === 'string'; }).join(' '));
		var rijeci = (tekst.match(/[a-z0-9]+/g) || []).length;
		if (rijeci < 20) return null;
		var najbolje = null;
		STRUCNA_PODRUCJA.forEach(function (p) {
			if (p.obavezniRegexi.length && !p.obavezniRegexi.some(function (re) { return re.test(tekst); })) return;
			var pogodaka = 0, razlicitih = 0;
			p.regexi.forEach(function (re) {
				var m = tekst.match(re);
				if (m) { pogodaka += m.length; razlicitih++; }
			});
			var gustoca = pogodaka / rijeci * 100;
			if (razlicitih >= (p.minRazlicitih || STRUCNO_MIN_RAZLICITIH) && gustoca >= STRUCNO_MIN_GUSTOCA &&
				(!najbolje || (p.prednost && !najbolje.prednost) || (!najbolje.prednost && pogodaka > najbolje.pogodaka))) {
				// Medicinski račun ima prednost pred općim područjem medicine (bolnički račun je račun, ne nalaz).
				najbolje = { podrucje: p.kljuc, naziv: p.naziv, pogodaka: pogodaka, razlicitih: razlicitih, gustoca: gustoca, prednost: !!p.prednost };
			}
		});
		return najbolje;
	}

	/* ---------- Izrada Word (.docx) datoteke ---------- */

	var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
	var XML_ZAGLAVLJE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

	function xmlEsc(t) {
		return String(t)
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function runovi(tekst) {
		return String(tekst).split(/(\t|\n)/).map(function (d) {
			if (d === '\t') return '<w:r><w:tab/></w:r>';
			if (d === '\n') return '<w:r><w:br/></w:r>';
			return d ? '<w:r><w:t xml:space="preserve">' + xmlEsc(d) + '</w:t></w:r>' : '';
		}).join('');
	}

	async function napraviDocx(odlomci) {
		var JSZip = await ucitaj('jszip');
		var tijelo = odlomci.map(function (o) {
			return typeof o === 'string'
				? '<w:p>' + runovi(o) + '</w:p>'
				: '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
		}).join('') || '<w:p/>';

		var zip = new JSZip();
		zip.file('[Content_Types].xml', XML_ZAGLAVLJE +
			'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
			'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
			'<Default Extension="xml" ContentType="application/xml"/>' +
			'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
			'<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
			'</Types>');
		zip.file('_rels/.rels', XML_ZAGLAVLJE +
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
			'</Relationships>');
		zip.file('word/_rels/document.xml.rels', XML_ZAGLAVLJE +
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
			'</Relationships>');
		zip.file('word/styles.xml', XML_ZAGLAVLJE +
			'<w:styles xmlns:w="' + W_NS + '"><w:docDefaults>' +
			'<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="hr-HR"/></w:rPr></w:rPrDefault>' +
			'<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
			'</w:docDefaults></w:styles>');
		zip.file('word/document.xml', XML_ZAGLAVLJE +
			'<w:document xmlns:w="' + W_NS + '"><w:body>' + tijelo +
			'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
			'</w:body></w:document>');
		return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
	}

	function spremi(blob, ime) {
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = ime;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
	}

	function imeWordDatoteke(ime) {
		return ime.replace(/\.[^.]+$/, '') + ' - tekst.docx';
	}

	/* ---------- Pomoćne funkcije ---------- */

	function broj(v) {
		var n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
		return isNaN(n) ? 0 : n;
	}

	function fmt(n, dec) {
		return Number(n).toLocaleString('hr-HR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
	}

	function mnozina(n, jedan, dva, pet) {
		var d = Math.abs(n) % 10, s = Math.abs(n) % 100;
		if (d === 1 && s !== 11) return jedan;
		if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return dva;
		return pet;
	}

	function prihvacaSlike(s) {
		if (s.vrsta === 'pdf' || s.vrsta === 'docx' || s.vrsta === 'odt') return true;
		return s.vrsta === 'tablica' && /\.(xlsx|xlsm|ods)$/i.test(s.ime);
	}

	function ekstenzija(ime) {
		var m = /\.([^.]+)$/.exec(ime);
		return m ? m[1].toLowerCase() : '';
	}

	function el(tag, klasa, tekst) {
		var e = document.createElement(tag);
		if (klasa) e.className = klasa;
		if (tekst != null) e.textContent = tekst;
		return e;
	}

	var IKONA_PREUZIMANJA = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m-3.5-3.5L8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

	/* ---------- Kalkulator ---------- */

	function Kalkulator(korijen) {
		var d = korijen.dataset;
		this.cfg = {
			znakova: Math.max(1, parseInt(d.znakova, 10) || 1500),
			// Najmanja obračunska jedinica po dokumentu (zasebno uvezan prijevod).
			minKartica: d.minKartica === undefined || d.minKartica === '' ? 1 : Math.max(0, parseFloat(String(d.minKartica).replace(',', '.')) || 0),
			decimale: Math.min(4, Math.max(0, parseInt(d.decimale, 10) || 0)),
			jezici: d.jezici || 'hrv+deu',
			cijena: parseFloat(d.cijena) || 0,
			// Slanje upita za ponudu (url = REST ruta plugina; prazno = testna verzija bez slanja).
			ponuda: {
				ukljuceno: d.ponuda !== 'ne',
				url: d.ponudaUrl || '',
				email: d.ponudaEmail || '',
				maxMb: parseFloat(d.ponudaMaxMb) || 15,
				privatnost: d.ponudaPrivatnost || '',
				token: d.ponudaToken || '',
				turnstile: d.ponudaTurnstile || ''
			},
			// Cjenik: cijena kartice bez i s ovjerom te troškovi dostave (prazno = bez izračuna cijene).
			cjenik: d.cijenaNeovjereno ? {
				neovjereno: broj(d.cijenaNeovjereno),
				ovjereno: broj(d.cijenaOvjereno),
				skenStranica: broj(d.dostavaSken),
				postaHr: broj(d.dostavaHr),
				postaIno: broj(d.dostavaIno),
				strucnoPostotak: d.strucnoPostotak === undefined || d.strucnoPostotak === '' ? 20 : Math.max(0, broj(d.strucnoPostotak)),
				mnoziteljStranica: d.mnoziteljStranica === undefined || d.mnoziteljStranica === '' ? 2 : Math.max(1, broj(d.mnoziteljStranica)),
				dodatneStranice: d.dodatneStranice === undefined || d.dodatneStranice === '' ? 3 : Math.max(0, parseInt(d.dodatneStranice, 10) || 0),
				adresa: d.adresa || '',
				napomenaPdv: d.napomenaPdv === undefined ? 'Navedene cijene ne sadrže PDV.\nObveznik nije u sustavu PDV-a, PDV nije obračunat temeljem čl. 90. st. 1. Zakona o PDV-u.' : d.napomenaPdv
			} : null,
			valuta: d.valuta || ''
		};
		if (d.docSkripta && !BIBLIOTEKE.worddoc.src) BIBLIOTEKE.worddoc.src = d.docSkripta;
		// Obračun e-ovjere iz postavki plugina (zadano 0,5 kartice).
		STANDARDNI_DIJELOVI.forEach(function (sd) {
			if (sd.obracun !== 'fiksno') return;
			var v = sd.postavka === 'epotpis' ? d.epotpisKartice : d.eovjeraKartice;
			if (v !== undefined && v !== '') sd.kartice = broj(v);
		});
		if (d.decimale === undefined || d.decimale === '') this.cfg.decimale = 2;
		// Zaokruživanje na više na zadani korak (zadano pola kartice); 0 = bez zaokruživanja.
		var korak = d.zaokruzivanje === undefined || d.zaokruzivanje === '' ? 0.5 : parseFloat(String(d.zaokruzivanje).replace(',', '.'));
		this.cfg.korak = isNaN(korak) || korak < 0 ? 0.5 : korak;

		// Prikaz: 'javni' (za naručitelje, bez tehničkih pojedinosti) ili 'detaljni' (za prevoditelja).
		this.javno = d.prikaz === 'javni';
		// Privatna stranica prevoditelja: detaljni prikaz s brojem znakova i pretvaranjem u Word.
		this.prevoditelj = d.prikaz === 'prevoditelj';
		this.cfg.pretvaranje = this.prevoditelj ? {
			url: d.pretvaranjeUrl || '',
			nonce: d.restNonce || '',
			adobe: d.adobe === '1',
			iscrpljeno: d.adobeIscrpljeno === '1',
			broj: parseInt(d.adobeBroj, 10) || 0,
			limit: parseInt(d.adobeLimit, 10) || 0,
			jezik: d.adobeJezik || 'hr-HR',
			jezici: (function () { try { return JSON.parse(d.adobeJezici || '{}'); } catch (e) { return {}; } })()
		} : null;
		if (this.javno) korijen.classList.add('kk--javni');
		this.k = korijen;
		this.stavke = [];
		this.grupe = [];
		this.brojacGrupa = 0;
		this.grupiranjePotvrdeno = true;
		this.radi = false;
		this.brojac = 0;
		this.napredak = null;
		this.$ = {
			zona: korijen.querySelector('.kk-zona'),
			input: korijen.querySelector('.kk-input'),
			popis: korijen.querySelector('.kk-popis'),
			akcije: korijen.querySelector('.kk-akcije'),
			pokreni: korijen.querySelector('.kk-pokreni'),
			info: korijen.querySelector('.kk-akcije-info'),
			ukupno: korijen.querySelector('.kk-ukupno'),
			broj: korijen.querySelector('.kk-kartice-broj'),
			znakovi: korijen.querySelector('.kk-znakovi'),
			cijena: korijen.querySelector('.kk-cijena'),
			narudzba: korijen.querySelector('.kk-narudzba'),
			obracun: korijen.querySelector('.kk-obracun'),
			ispuna: korijen.querySelector('.kk-list-ispuna'),
			list: korijen.querySelector('.kk-list'),
			ocisti: korijen.querySelector('.kk-ocisti'),
			slike: korijen.querySelector('.kk-slike')
		};
		// Tekst na slikama unutar dokumenata prepoznaje se uvijek (kvačica postoji samo ako je dodana u oznake).
		this.slike = this.$.slike ? this.$.slike.checked : true;
		// Klijentska verzija: bez ikone i retka s brojem kartica, definicije kartice i podjele; ostaje samo cijena.
		if (this.javno) {
			[this.$.list, korijen.querySelector('.kk-ukupno-tekst')].forEach(function (e) {
				if (e && e.parentNode) e.parentNode.removeChild(e);
			});
		}
		this.izbor = { ovjera: null, dostava: null, sken: false };
		this.greska = { ovjera: false, dostava: false, grupiranje: false };
		this.nacrtajNarudzbu();
		// Na mobitelu i tabletu datoteke se ne povlače nego odabiru: naslov polja to i kaže, a redak
		// "ili odaberite datoteke s računala" se skriva.
		if (JE_MOBITEL) {
			var naslovZone = korijen.querySelector('.kk-zona-naslov');
			if (naslovZone) naslovZone.textContent = '1. Kliknite ovdje i odaberite datoteke s Vašeg mobilnog uređaja';
			var opisZone = korijen.querySelector('.kk-zona-opis');
			if (opisZone) opisZone.hidden = true;
		}
		this._otvoreno = Date.now();
		if (this.prevoditelj) {
			var lok = korijen.querySelector('.kk-zona-lokalno');
			if (lok) lok.textContent = 'Datoteke se obrađuju u Vašem pregledniku. Pri pretvaranju u Word preko Adobea dokument se šalje Adobeu na obradu.';
		}
		this.nacrtajTrakuPrevoditelja();
		this.nacrtajGrupiranje();
		this.nacrtajPonudu();
		this.poveziDogadaje();
		this.osvjeziZbroj();
	}

	Kalkulator.prototype.zaokruzi = function (kartice) {
		var k = this.cfg.korak;
		if (!k || kartice <= 0) return kartice;
		return Math.ceil(kartice / k - 1e-9) * k;
	};

	Kalkulator.prototype.prikaziKartice = function (kartice) {
		var k = this.cfg.korak;
		if (!k) return fmt(kartice, this.cfg.decimale);
		var dec = (String(k).split('.')[1] || '').length;
		return this.zaokruzi(kartice).toLocaleString('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
	};

	// Izbor vrste prijevoda i dostave (prema cjeniku).
	Kalkulator.prototype.nacrtajNarudzbu = function () {
		var c = this.cfg.cjenik, self = this, n = this.$.narudzba;
		if (!c || !n) { if (n) n.hidden = true; return; }
		var v = this.cfg.valuta ? ' ' + this.cfg.valuta : '';
		var ime = this.k.id || 'kk';

		function izbor(fs, kljuc, iz, odabrano, kadPromijeni) {
			var lab = el('label', 'kk-izbor');
			var r = el('input');
			r.type = 'radio';
			r.name = ime + '-' + kljuc;
			r.value = iz.vrijednost;
			r.checked = odabrano === iz.vrijednost;
			r.addEventListener('change', function () { if (r.checked) kadPromijeni(iz.vrijednost); });
			var t = el('span', 'kk-izbor-tekst');
			t.appendChild(el('span', 'kk-izbor-naziv', iz.naziv));
			if (iz.opis && !(self.javno && iz.cijena)) t.appendChild(el('span', 'kk-izbor-opis', iz.opis));
			lab.appendChild(r);
			lab.appendChild(t);
			fs.appendChild(lab);
		}

		// Vrsta prijevoda
		var fsOvjera = this.$.fsOvjera = el('fieldset', 'kk-skupina');
		fsOvjera.appendChild(el('legend', null, '2. Odaberite vrstu prijevoda'));
		[
			{ vrijednost: 'da', naziv: 'Ovjereni prijevod', opis: fmt(c.ovjereno, 2) + v + ' po kartici', cijena: true },
			{ vrijednost: 'ne', naziv: 'Neovjereni prijevod', opis: fmt(c.neovjereno, 2) + v + ' po kartici', cijena: true }
		].forEach(function (iz) {
			izbor(fsOvjera, 'ovjera', iz, null, function (vr) {
				// Načini dostave ovise o vrsti prijevoda; osobno preuzimanje ostaje odabrano, ostalo se bira ponovno.
				self.izbor.ovjera = vr;
				self.greska.ovjera = false;
				if (self.izbor.dostava !== 'osobno') self.izbor.dostava = null;
				if (vr !== 'da') self.izbor.sken = false;
				self.nacrtajDostavu();
				self.osvjeziZbroj();
			});
		});
		n.appendChild(fsOvjera);

		// Dostava (sadržaj ovisi o vrsti prijevoda)
		this.$.fsDostava = el('fieldset', 'kk-skupina');
		n.appendChild(this.$.fsDostava);
		this.nacrtajDostavu();
		n.hidden = false;

	};

	// "Dodatno – slanje mailom" ima smisla samo uz ovjereni prijevod i osobno preuzimanje ili poštu.
	Kalkulator.prototype.trebaDodatakSken = function () {
		return this.izbor.ovjera === 'da' && ['osobno', 'postaHr', 'postaIno'].indexOf(this.izbor.dostava) >= 0;
	};

	Kalkulator.prototype.nacrtajDostavu = function () {
		this.nacrtajDostavuSadrzaj();
		this.obnoviGreske();
	};

	Kalkulator.prototype.nacrtajDostavuSadrzaj = function () {
		var c = this.cfg.cjenik, self = this, fs = this.$.fsDostava;
		var v = this.cfg.valuta ? ' ' + this.cfg.valuta : '';
		var ime = this.k.id || 'kk';
		fs.textContent = '';
		fs.appendChild(el('legend', null, '3. Odaberite način dostave'));
		var osobno = { vrijednost: 'osobno', naziv: 'Osobno preuzimanje', opis: (c.adresa ? c.adresa + ', ' : '') + 'uz prethodnu najavu, bez naplate' };
		var izbori;
		if (!this.izbor.ovjera) {
			fs.appendChild(el('p', 'kk-skupina-uputa', 'Najprije odaberite vrstu prijevoda.'));
			return;
		} else if (this.izbor.ovjera === 'ne') {
			// Neovjereni prijevod: dostava mailom bez naplate ili osobno preuzimanje.
			izbori = [
				{ vrijednost: 'mail', naziv: 'Dostava mailom', opis: 'bez naplate' },
				osobno
			];
		} else {
			izbori = [
				osobno,
				{ vrijednost: 'postaHr', naziv: 'Preporučena pošiljka – Republika Hrvatska', opis: fmt(c.postaHr, 2) + v, cijena: true },
				{ vrijednost: 'postaIno', naziv: 'Preporučena pošiljka – inozemstvo', opis: fmt(c.postaIno, 2) + v, cijena: true },
				{ vrijednost: 'mail', naziv: 'Samo mailom', opis: this.javno ? '' : 'skenirani prijevod, trošak skeniranja ' + fmt(c.skenStranica, 2) + v + ' po stranici ovjerenog prijevoda' }
			];
			// Kad je odabrano osobno preuzimanje ili pošta, "Samo mailom" se skriva (slanje mailom je tada dodatak).
			if (['osobno', 'postaHr', 'postaIno'].indexOf(this.izbor.dostava) >= 0) {
				izbori = izbori.filter(function (iz) { return iz.vrijednost !== 'mail'; });
			}
		}
		izbori.forEach(function (iz) {
			var lab = el('label', 'kk-izbor');
			var r = el('input');
			r.type = 'radio';
			r.name = ime + '-dostava';
			r.value = iz.vrijednost;
			r.checked = self.izbor.dostava === iz.vrijednost;
			r.addEventListener('change', function () {
				if (!r.checked) return;
				self.izbor.dostava = iz.vrijednost;
				self.greska.dostava = false;
				self.nacrtajDostavu();
				var odabrani = self.$.fsDostava.querySelector('input[type=radio]:checked');
				if (odabrani) odabrani.focus();
				self.osvjeziZbroj();
			});
			var t = el('span', 'kk-izbor-tekst');
			t.appendChild(el('span', 'kk-izbor-naziv', iz.naziv));
			if (iz.opis && !(self.javno && iz.cijena)) t.appendChild(el('span', 'kk-izbor-opis', iz.opis));
			lab.appendChild(r);
			lab.appendChild(t);
			fs.appendChild(lab);
		});
		this.$.dodatakSken = null;
		// Ovjereni prijevod: skenirani prijevod mailom kao dodatak osobnom preuzimanju ili dostavi poštom.
		if (this.izbor.ovjera === 'da') {
			var dod = el('label', 'kk-izbor kk-dodatak');
			var cb = el('input');
			cb.type = 'checkbox';
			cb.checked = !!this.izbor.sken;
			cb.addEventListener('change', function () { self.izbor.sken = cb.checked; self.osvjeziZbroj(); });
			var t = el('span', 'kk-izbor-tekst');
			t.appendChild(el('span', 'kk-izbor-naziv', 'Dodatno – slanje mailom'));
			if (!this.javno) t.appendChild(el('span', 'kk-izbor-opis', 'trošak skeniranja ' + fmt(c.skenStranica, 2) + v + ' po stranici ovjerenog prijevoda'));
			dod.appendChild(cb);
			dod.appendChild(t);
			dod.hidden = !this.trebaDodatakSken();
			fs.appendChild(dod);
			this.$.dodatakSken = dod;
		}
		// Povratak na sve načine dostave (npr. ako se naručitelj ipak odluči za "Samo mailom").
		if (this.izbor.ovjera === 'da' && this.izbor.dostava && this.izbor.dostava !== 'mail') {
			var ponisti = el('button', 'kk-ponisti', 'Poništi odabir dostave');
			ponisti.type = 'button';
			ponisti.addEventListener('click', function () {
				self.izbor.dostava = null;
				self.izbor.sken = false;
				self.nacrtajDostavu();
				var prvi = self.$.fsDostava.querySelector('input[type=radio]');
				if (prvi) prvi.focus();
				self.osvjeziZbroj();
			});
			fs.appendChild(ponisti);
		}
	};

	// Okvirna cijena: prijevod (zaokruženi broj kartica × cijena kartice) + dostava.
	Kalkulator.prototype.osvjeziObracun = function (kartice, strucneObr) {
		var c = this.cfg.cjenik, o = this.$.obracun;
		if (!c || !o) return;
		var v = this.cfg.valuta ? ' ' + this.cfg.valuta : '';
		o.textContent = '';
		o.hidden = false;
		if (!this.izbor.ovjera || !this.izbor.dostava) {
			var nedostaje = [];
			if (!this.izbor.ovjera) nedostaje.push('vrstu prijevoda');
			if (!this.izbor.dostava) nedostaje.push('način dostave');
			o.appendChild(el('p', 'kk-obracun-uputa', 'Za izračun cijene odaberite ' + nedostaje.join(' i ') + '.'));
			return;
		}
		var redovi = [], self = this;
		var cijenaKartice = this.izbor.ovjera === 'da' ? c.ovjereno : c.neovjereno;
		var prijevod = kartice * cijenaKartice;
		// Stručni tekstovi: prijevod tih dokumenata skuplji je za zadani postotak; dostava i skeniranje ostaju isti.
		var strucni = [];
		this.grupe.forEach(function (g) {
			var p = self.podaciDokumenta(g);
			if (!p.gotovih || !p.strucno) return;
			strucni.push({ grupa: g, strucno: p.strucno });
		});
		strucneObr = strucneObr || 0;
		var cijenaStrucno = cijenaKartice * (1 + c.strucnoPostotak / 100);
		var dodatakStrucno = strucni.length && c.strucnoPostotak ? strucneObr * (cijenaStrucno - cijenaKartice) : 0;
		var vrsta = this.izbor.ovjera === 'da' ? 'Ovjereni' : 'Neovjereni';
		var javno = this.javno, fmtK = this.fmtKarticeBroj.bind(this);
		function redPrijevoda(naziv, k, cijena) {
			return [naziv + (javno ? '' : ': ' + fmtK(k) + ' × ' + fmt(cijena, 2) + v), k * cijena];
		}
		redovi.push(redPrijevoda(vrsta + ' prijevod', kartice, cijenaKartice));
		// Stručna varijanta: prijevod podijeljen na standardne i stručne tekstove, svaki po svojoj cijeni.
		var redoviPrijevodaStrucno = strucneObr < kartice
			? [redPrijevoda(vrsta + ' prijevod – standardni tekst', kartice - strucneObr, cijenaKartice),
				redPrijevoda(vrsta + ' prijevod – stručni tekst', strucneObr, cijenaStrucno)]
			: [redPrijevoda(vrsta + ' prijevod – stručni tekst', strucneObr, cijenaStrucno)];
		var dostava = 0, ovjereno = this.izbor.ovjera === 'da';
		switch (this.izbor.dostava) {
			case 'osobno': redovi.push(['Osobno preuzimanje', 0]); break;
			case 'mail': if (!ovjereno) redovi.push(['Dostava mailom', 0]); break;
			case 'postaHr': redovi.push(['Preporučena pošiljka – Republika Hrvatska', c.postaHr]); dostava += c.postaHr; break;
			case 'postaIno': redovi.push(['Preporučena pošiljka – inozemstvo', c.postaIno]); dostava += c.postaIno; break;
		}
		if (ovjereno && (this.izbor.dostava === 'mail' || (this.izbor.sken && this.trebaDodatakSken()))) {
			// Stranice ovjerenog prijevoda: za svaki prijevod stranice izvornika × 2 + 3 dodatne stranice.
			// Svaki dokument je jedan prijevod, i kad se sastoji od više datoteka.
			var izvornik = 0, prijevoda = 0, procjena = false;
			this.grupe.forEach(function (g) {
				var p = self.podaciDokumenta(g);
				if (!p.gotovih) return;
				izvornik += p.stranice;
				prijevoda++;
				if (p.procjena) procjena = true;
			});
			var dodatne = prijevoda * c.dodatneStranice;
			var stranice = izvornik * c.mnoziteljStranica + dodatne;
			var sken = stranice * c.skenStranica;
			redovi.push(['Trošak skeniranja za dostavu mailom: ukupno ' + stranice + ' ' + mnozina(stranice, 'stranica', 'stranice', 'stranica') +
				(this.javno ? '' : ' × ' + fmt(c.skenStranica, 2) + v), sken]);
			if (!this.javno) redovi.push(['(' + izvornik + ' ' + mnozina(izvornik, 'stranica', 'stranice', 'stranica') + ' izvornika' +
				(c.mnoziteljStranica !== 1 ? ' × ' + fmt(c.mnoziteljStranica, 0) : '') +
				' + ' + dodatne + ' ' + mnozina(dodatne, 'dodatna stranica', 'dodatne stranice', 'dodatnih stranica') +
				(prijevoda > 1 ? ' za ' + prijevoda + ' prijevoda' : '') +
				(procjena ? '; broj stranica izvornika dijelom je procjena' : '') + ')', null]);
			dostava += sken;
		}
		// Blok obračuna: stavke i okvirna cijena. Kod stručnih tekstova prikazuju se dva bloka,
		// standardni i stručni; razlikuju se samo u retku prijevoda.
		function blok(naslov, stavke, ukupnoNaziv, ukupnoIznos, klasa, dodatniUkupno) {
			var t = el('div', 'kk-obracun-redovi' + (klasa ? ' ' + klasa : ''));
			if (naslov === 'stupci') {
				// Zaglavlje stupaca: STAVKA iznad opisa, CIJENA iznad iznosa.
				var z = el('div', 'kk-obracun-red kk-obracun-zaglavlje');
				z.appendChild(el('span', null, 'Stavka'));
				z.appendChild(el('span', 'kk-obracun-iznos', 'Cijena'));
				t.appendChild(z);
			} else if (naslov) t.appendChild(el('p', 'kk-obracun-naslov', naslov));
			stavke.forEach(function (r) {
				var red = el('div', 'kk-obracun-red');
				red.appendChild(el('span', null, r[0]));
				if (r[1] === null) red.className += ' kk-obracun-detalj';
				else red.appendChild(el('span', 'kk-obracun-iznos', fmt(r[1], 2) + v));
				t.appendChild(red);
			});
			var u = el('div', 'kk-obracun-red kk-obracun-ukupno');
			u.appendChild(el('span', null, ukupnoNaziv));
			u.appendChild(el('span', 'kk-obracun-iznos', fmt(ukupnoIznos, 2) + v));
			t.appendChild(u);
			(dodatniUkupno || []).forEach(function (d) {
				var r = el('div', 'kk-obracun-red kk-obracun-ukupno kk-obracun-ukupno-dodatni');
				r.appendChild(el('span', null, d[0]));
				r.appendChild(el('span', 'kk-obracun-iznos', fmt(d[1], 2) + v));
				t.appendChild(r);
			});
			o.appendChild(t);
		}
		// Obavijest o stručnom tekstu ide odmah ispod broja kartica, prije cijena.
		if (dodatakStrucno) {
			var imena = strucni.map(function (x) { return self.opisDokumentaZaObavijest(x.grupa); });
			var podrucja = [];
			strucni.forEach(function (x) { if (podrucja.indexOf(x.strucno.naziv) < 0) podrucja.push(x.strucno.naziv); });
			var obav = el('div', 'kk-obracun-strucno');
			obav.setAttribute('role', 'note');
			obav.appendChild(el('p', 'kk-obracun-strucno-naslov', strucni.length === 1
				? 'Dokument ' + imena[0] + ' prepoznat je kao stručni tekst (' + podrucja[0] + ').'
				: 'Dokumenti ' + imena.slice(0, -1).join(', ') + ' i ' + imena[imena.length - 1] + ' prepoznati su kao stručni tekstovi (' + podrucja.join(', ') + ').'));
			obav.appendChild(el('p', null, 'Radi li se doista o stručnom tekstu, konačno procjenjuje prevoditelj nakon pregleda dokumenata, pa o toj procjeni ovisi i konačna cijena ponude.'));
			o.appendChild(obav);
		}
		if (dodatakStrucno) {
			// Prikazuje se samo izračun s dodatkom, a ispod okvirna cijena bez dodatka.
			var redoviStrucno = redoviPrijevodaStrucno.concat(redovi.slice(1));
			blok('stupci', redoviStrucno, 'Okvirna cijena – s dodatkom za prijevod stručnog teksta',
				prijevod + dodatakStrucno + dostava, 'kk-obracun-redovi--strucno',
				[['Okvirna cijena – bez dodatka za prijevod stručnog teksta (procjenjuje prevoditelj)', prijevod + dostava]]);
		} else {
			// Bez stručnog teksta: samo okvirna cijena, bez naslova.
			blok('', redovi, 'Okvirna cijena', prijevod + dostava);
		}
		if (c.napomenaPdv) {
			// Svaka rečenica napomene u svom retku.
			var pdv = el('p', 'kk-obracun-uputa');
			String(c.napomenaPdv).split('\n').forEach(function (r, i) {
				if (i) pdv.appendChild(document.createElement('br'));
				pdv.appendChild(document.createTextNode(r));
			});
			o.appendChild(pdv);
		}
		o.appendChild(el('p', 'kk-obracun-uputa kk-obracun-konacno', 'Konačnu cijenu potvrđujemo nakon što nam dostavite dokumente.'));
	};

	// 1 kartica, 2 kartice, 5 kartica; s decimalama (1,5) kartice.
	Kalkulator.prototype.oznakaKartica = function (k) {
		if (Math.abs(k - Math.round(k)) > 1e-9) return 'kartice';
		return mnozina(Math.round(k), 'kartica', 'kartice', 'kartica');
	};

	Kalkulator.prototype.fmtKarticeBroj = function (k) {
		var t = this.prikaziKartice(k);
		return t + ' ' + (Math.abs(k - Math.round(k)) < 1e-9 ? mnozina(Math.round(k), 'kartica', 'kartice', 'kartica') : 'kartice');
	};

	Kalkulator.prototype.poveziDogadaje = function () {
		var self = this, z = this.$.zona, dubina = 0;

		z.addEventListener('click', function () { self.$.input.click(); });
		z.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.$.input.click(); }
		});
		this.$.input.addEventListener('change', function () {
			self.dodaj(this.files);
			this.value = '';
		});

		z.addEventListener('dragenter', function (e) { e.preventDefault(); dubina++; z.classList.add('kk-zona--iznad'); });
		z.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
		z.addEventListener('dragleave', function () { if (--dubina <= 0) { dubina = 0; z.classList.remove('kk-zona--iznad'); } });
		z.addEventListener('drop', function (e) {
			e.preventDefault();
			dubina = 0;
			z.classList.remove('kk-zona--iznad');
			if (e.dataTransfer && e.dataTransfer.files) self.dodaj(e.dataTransfer.files);
		});

		if (this.$.slike) this.$.slike.addEventListener('change', function () {
			self.slike = this.checked;
			// Datoteke sa slikama koje su već prebrojane s drugom postavkom vraćaju se na čekanje.
			self.stavke.forEach(function (s) {
				if (!prihvacaSlike(s) || s.slikeKoristeno === undefined || s.slikeKoristeno === self.slike) return;
				if (s.stanje === 'gotovo') { s.stanje = 'cekanje'; s.rucno = false; self.osvjeziStavku(s); }
				else if (s.stanje === 'obrada') s.ponovi = true;
			});
			self.osvjeziZbroj();
		});

		this.$.pokreni.addEventListener('click', function () { self.prebroji(); });

		this.$.ocisti.addEventListener('click', function () {
			self.stavke.forEach(function (s) { s.uklonjena = true; });
			self.stavke = [];
			self.grupe = [];
			self.grupiranjePotvrdeno = true;
			self.greska.grupiranje = false;
			self.nacrtajPopis();
			self.obnoviGreske();
			self.osvjeziZbroj();
			z.focus();
		});
	};

	// Ista datoteka (isto ime i veličina) ne može biti na popisu više puta, jer bi se naplatila više puta.
	function kljucDatoteke(f) {
		return String(f.name).toLowerCase() + '|' + f.size;
	}

	/* ---------- Dokumenti i grupiranje ----------
	   Dokument (grupa) je jedan prijevod: jedna datoteka ili više njih (npr. tri slike jednog dokumenta).
	   this.grupe drži redoslijed dokumenata, a this.stavke je ravni popis svih datoteka istim redom. */

	Kalkulator.prototype.uskladiStavke = function () {
		var sve = [];
		this.grupe.forEach(function (g) { Array.prototype.push.apply(sve, g.stavke); });
		this.stavke = sve;
	};

	Kalkulator.prototype.grupaOd = function (s) {
		for (var i = 0; i < this.grupe.length; i++) if (this.grupe[i].stavke.indexOf(s) >= 0) return this.grupe[i];
		return null;
	};

	Kalkulator.prototype.novaGrupa = function (stavke) {
		return { id: ++this.brojacGrupa, stavke: stavke };
	};

	Kalkulator.prototype.dodaj = function (datoteke) {
		var self = this, ponovljene = [], novih = 0;
		var postojece = {};
		this.stavke.forEach(function (s) { if (s.kljuc) postojece[s.kljuc] = true; });
		Array.prototype.forEach.call(datoteke, function (f) {
			var kljuc = kljucDatoteke(f);
			if (postojece[kljuc]) { ponovljene.push(f.name); return; }
			postojece[kljuc] = true;
			var ext = ekstenzija(f.name);
			var s = {
				id: ++self.brojac,
				datoteka: f,
				ime: f.name,
				vrsta: VRSTE[ext] || null,
				stanje: 'cekanje',
				znakova: 0,
				odlomci: null,
				napomena: '',
				kljuc: kljuc
			};
			if (!s.vrsta) {
				s.stanje = 'greska';
				s.napomena = NEPODRZANO[ext] || 'Ova vrsta datoteke nije podržana. Dodajte PDF, Word (.docx, .doc), OpenDocument (.odt), Excel, sliku ili .txt.';
			}
			self.grupe.push(self.novaGrupa([s]));
			novih++;
		});
		if (novih) {
			this.uskladiStavke();
			// Nove datoteke: treba ponovno potvrditi pripadaju li neke istom dokumentu.
			this.grupiranjePotvrdeno = this.stavke.length < 2;
			this.nacrtajPopis();
		}
		this.obavijesti(ponovljene.length
			? (ponovljene.length === 1
				? 'Datoteka „' + ponovljene[0] + '” već je učitana.'
				: 'Datoteke ' + ponovljene.map(function (n) { return '„' + n + '”'; }).join(', ') + ' već su učitane.')
			: '');
		this.osvjeziZbroj();
	};

	// Kratka obavijest ispod polja za datoteke (nestaje sama nakon nekoliko sekundi).
	Kalkulator.prototype.obavijesti = function (tekst) {
		var p = this.$.obavijest;
		if (!p) {
			p = this.$.obavijest = el('p', 'kk-obavijest');
			p.setAttribute('role', 'status');
			this.$.zona.parentNode.insertBefore(p, this.$.zona.nextSibling);
		}
		clearTimeout(this._obavijestTimer);
		p.textContent = tekst;
		p.hidden = !tekst;
		if (tekst) this._obavijestTimer = setTimeout(function () { p.hidden = true; }, 8000);
	};

	// Zbirni podaci dokumenta: kartice, stranice izvornika i stručnost (na cijelom tekstu dokumenta).
	Kalkulator.prototype.podaciDokumenta = function (g) {
		var p = { znakova: 0, fiksno: 0, stranice: 0, procjena: false, gotovih: 0, cekaju: 0, odlomci: [], kljuc: '' };
		g.stavke.forEach(function (s) {
			if (s.stanje === 'gotovo') {
				p.znakova += s.znakova;
				p.fiksno += s.fiksno || 0;
				p.stranice += s.stranice || 1;
				if (s.straniceProcjena) p.procjena = true;
				p.gotovih++;
				p.kljuc += s.id + ',';
				if (s.odlomci && s.odlomci.length) {
					if (p.odlomci.length) p.odlomci.push(PRIJELOM);
					Array.prototype.push.apply(p.odlomci, s.odlomci);
				}
			} else if (s.stanje === 'cekanje' || s.stanje === 'obrada') p.cekaju++;
		});
		if (g.stavke.length === 1) {
			p.strucno = p.gotovih ? g.stavke[0].strucno || null : null;
		} else {
			if (g._strucnoKljuc !== p.kljuc) {
				g._strucnoKljuc = p.kljuc;
				g._strucno = p.gotovih ? prepoznajStrucno(p.odlomci) : null;
			}
			p.strucno = g._strucno;
		}
		p.kartice = p.znakova / this.cfg.znakova + p.fiksno;
		return p;
	};

	// Obračunske kartice dokumenta: zaokruženo na više (pola kartice), najmanje 1 kartica po dokumentu,
	// jer se svaki dokument uvezuje i ovjerava zasebno, i kad ima manje od jedne kartice teksta.
	Kalkulator.prototype.obracunskeKartice = function (g, p) {
		p = p || this.podaciDokumenta(g);
		if (!p.gotovih) return 0;
		return Math.max(this.cfg.minKartica, this.zaokruzi(p.kartice));
	};

	Kalkulator.prototype.opisDokumentaZaObavijest = function (g) {
		if (g.stavke.length === 1) return '„' + g.stavke[0].ime + '”';
		var n = g.stavke.length;
		return 'od ' + n + ' ' + mnozina(n, 'datoteke', 'datoteke', 'datoteka') + ' („' + g.stavke[0].ime + '” i dr.)';
	};

	// Sličica: prava slika za slike, prva stranica za PDF, oznaka vrste za ostalo.
	Kalkulator.prototype.slicica = function (s) {
		if (s._slicica) return s._slicica;
		var f = s.datoteka, obecanje;
		if (!f) obecanje = Promise.resolve(null);
		else if (s.vrsta === 'slika') obecanje = Promise.resolve(URL.createObjectURL(f));
		else if (s.vrsta === 'pdf') {
			obecanje = ucitaj('pdf').then(async function (pdfjs) {
				pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
				var doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
				var str = await doc.getPage(1);
				var vp = str.getViewport({ scale: 96 / str.getViewport({ scale: 1 }).width });
				var c = document.createElement('canvas');
				c.width = Math.ceil(vp.width);
				c.height = Math.ceil(vp.height);
				var x = c.getContext('2d');
				x.fillStyle = '#ffffff';
				x.fillRect(0, 0, c.width, c.height);
				await str.render({ canvasContext: x, viewport: vp }).promise;
				var url = c.toDataURL('image/jpeg', 0.75);
				doc.destroy();
				return url;
			});
		} else obecanje = Promise.resolve(null);
		s._slicica = obecanje.catch(function () { return null; });
		return s._slicica;
	};

	Kalkulator.prototype.nacrtajPopis = function () {
		var self = this, popis = this.$.popis;
		this.unistiPovlacenje();
		popis.textContent = '';
		this.grupe = this.grupe.filter(function (g) { return g.stavke.length; });
		this.uskladiStavke();
		this.grupe.forEach(function (g, gi) {
			var vise = g.stavke.length > 1;
			var li = el('li', 'kk-dok' + (vise ? ' kk-dok--vise' : ''));
			li.dataset.grupa = g.id;
			g.dom = { li: li };
			if (vise) {
				var n = g.stavke.length;
				var zag = el('div', 'kk-dok-zaglavlje');
				var rucka = el('span', 'kk-rucka kk-rucka-dok', '⋮⋮');
				rucka.title = 'Povucite za promjenu redoslijeda dokumenata';
				rucka.setAttribute('aria-hidden', 'true');
				var info = el('div', 'kk-info');
				info.appendChild(el('span', 'kk-ime', 'Dokument od ' + n + ' ' + mnozina(n, 'datoteke', 'datoteke', 'datoteka')));
				var st = el('span', 'kk-status');
				info.appendChild(st);
				var rez = el('span', 'kk-rez');
				var rb = el('b', null, '–');
				var rj = el('span', 'kk-jedinica', ' kartica');
				rez.appendChild(rb);
				rez.appendChild(rj);
				var razdvoji = el('button', 'kk-mali-gumb', 'Razdvoji');
				razdvoji.type = 'button';
				razdvoji.title = 'Svaka datoteka ponovno postaje zaseban dokument';
				razdvoji.addEventListener('click', function () {
					var i = self.grupe.indexOf(g);
					var nove = g.stavke.map(function (s) { return self.novaGrupa([s]); });
					Array.prototype.splice.apply(self.grupe, [i, 1].concat(nove));
					self.nacrtajPopis();
					self.osvjeziZbroj();
				});
				zag.appendChild(rucka);
				zag.appendChild(info);
				if (!self.javno) zag.appendChild(rez);
				if (self.prevoditelj) zag.appendChild(self.gumbPretvorbe(g));
				zag.appendChild(razdvoji);
				li.appendChild(zag);
				g.dom.status = st;
				g.dom.rez = rb;
				g.dom.rezJed = rj;
				if (self.prevoditelj) {
					g.dom.pretvorba = el('span', 'kk-pretvorba-status');
					info.appendChild(g.dom.pretvorba);
				}
			}
			var ul = el('ul', 'kk-dok-datoteke');
			li.appendChild(ul);
			g.dom.ul = ul;
			g.stavke.forEach(function (s) { ul.appendChild(self.nacrtajDatoteku(s, g, gi)); });
			popis.appendChild(li);
		});
		this.stavke.forEach(function (s) { self.osvjeziStavku(s, true); });
		this.grupe.forEach(function (g) { self.osvjeziDokument(g); if (self.prevoditelj) self.osvjeziPretvorbu(g); });
		this.omoguciPovlacenje();
	};

	Kalkulator.prototype.nacrtajDatoteku = function (s, g, gi) {
		var self = this, vise = g.stavke.length > 1;
		var li = el('li', 'kk-stavka');
		li.dataset.id = s.id;

		var rucka = el('span', 'kk-rucka kk-rucka-dat', '⋮⋮');
		rucka.title = 'Povucite na drugu datoteku da ih spojite u jedan dokument';
		rucka.setAttribute('aria-hidden', 'true');

		var sl = el('span', 'kk-slicica');
		sl.appendChild(el('span', 'kk-slicica-oznaka', s.vrsta ? OZNAKE[s.vrsta] : (ekstenzija(s.ime).toUpperCase() || '?')));
		this.slicica(s).then(function (url) {
			if (!url) return;
			sl.textContent = '';
			var img = el('img');
			img.src = url;
			img.alt = '';
			sl.appendChild(img);
			sl.classList.add('kk-slicica--slika');
		});

		var info = el('div', 'kk-info');
		var ime = el('span', 'kk-ime', s.ime);
		ime.title = s.ime;
		var status = el('span', 'kk-status');
		var traka = el('span', 'kk-traka');
		var trakaIspuna = el('span');
		traka.appendChild(trakaIspuna);
		info.appendChild(ime);
		info.appendChild(status);
		info.appendChild(traka);

		var polje = el('label', 'kk-polje');
		var unos = el('input', 'kk-broj');
		unos.type = 'number';
		unos.min = '0';
		unos.step = '1';
		unos.inputMode = 'numeric';
		unos.setAttribute('aria-label', 'Broj znakova s razmacima za ' + s.ime);
		polje.appendChild(unos);
		polje.appendChild(el('span', 'kk-jedinica', 'znakova'));
		unos.addEventListener('input', function () {
			var v = parseInt(unos.value, 10);
			s.znakova = isNaN(v) || v < 0 ? 0 : v;
			s.rucno = true;
			self.osvjeziStavku(s);
			self.osvjeziZbroj();
		});

		var rez = el('span', 'kk-rez');
		var rezBroj = el('b', null, '–');
		var rezJed = el('span', 'kk-jedinica', ' kartica');
		rez.appendChild(rezBroj);
		rez.appendChild(rezJed);

		var word = el('button', 'kk-word');
		word.type = 'button';
		word.innerHTML = IKONA_PREUZIMANJA + '<span>Word</span>';
		word.title = 'Preuzmi pročitani tekst kao Word datoteku';
		word.setAttribute('aria-label', 'Preuzmi pročitani tekst iz ' + s.ime + ' kao Word datoteku');
		word.addEventListener('click', async function () {
			if (!s.odlomci) return;
			word.disabled = true;
			try {
				spremi(await napraviDocx(s.odlomci), imeWordDatoteke(s.ime));
			} catch (e) {
				s.dom.status.textContent = 'Word datoteka nije se mogla izraditi. Provjerite internetsku vezu i pokušajte ponovno.';
			}
			word.disabled = false;
		});

		// Zamjena za povlačenje (mobitel, tipkovnica): spajanje s dokumentom iznad i izdvajanje.
		var akcija = null;
		if (vise) {
			akcija = el('button', 'kk-mali-gumb', 'Izdvoji');
			akcija.title = 'Izdvoji ovu datoteku kao zaseban dokument';
			akcija.addEventListener('click', function () {
				g.stavke = g.stavke.filter(function (x) { return x !== s; });
				self.grupe.splice(self.grupe.indexOf(g) + 1, 0, self.novaGrupa([s]));
				self.nacrtajPopis();
				self.osvjeziZbroj();
			});
		} else if (gi > 0) {
			akcija = el('button', 'kk-mali-gumb', 'Spoji s dokumentom iznad');
			akcija.title = 'Ova datoteka je nastavak dokumenta iznad';
			akcija.addEventListener('click', function () {
				var i = self.grupe.indexOf(g);
				self.grupe[i - 1].stavke = self.grupe[i - 1].stavke.concat(g.stavke);
				self.grupe.splice(i, 1);
				self.nacrtajPopis();
				self.osvjeziZbroj();
			});
		}
		if (akcija) akcija.type = 'button';

		var ukloni = el('button', 'kk-ukloni', '×');
		ukloni.type = 'button';
		ukloni.setAttribute('aria-label', 'Ukloni ' + s.ime);
		ukloni.addEventListener('click', function () {
			s.uklonjena = true;
			g.stavke = g.stavke.filter(function (x) { return x !== s; });
			self.nacrtajPopis();
			self.osvjeziZbroj();
		});

		li.appendChild(rucka);
		li.appendChild(sl);
		li.appendChild(info);
		if (!this.javno) li.appendChild(polje);
		// Klijent ne vidi kartice: samo broj stranica (u opisu) i, na kraju, cijenu.
		if (!this.javno) li.appendChild(rez);
		if (!this.javno) li.appendChild(word);
		if (this.prevoditelj && !vise) {
			li.appendChild(this.gumbPretvorbe(g));
			g.dom.pretvorba = el('span', 'kk-pretvorba-status');
			info.appendChild(g.dom.pretvorba);
		}
		if (akcija) li.appendChild(akcija);
		li.appendChild(ukloni);

		s.dom = { li: li, status: status, traka: trakaIspuna, unos: unos, rez: rezBroj, rezJed: rezJed, word: word };
		return li;
	};

	Kalkulator.prototype.osvjeziStavku = function (s, bezDokumenta) {
		var d = s.dom;
		if (!d) return;
		var g = this.grupaOd(s), vise = g && g.stavke.length > 1;
		d.li.setAttribute('data-stanje', s.stanje);
		d.unos.disabled = s.stanje !== 'gotovo';
		d.word.disabled = !(s.stanje === 'gotovo' && s.odlomci);
		if (s.stanje === 'cekanje') {
			d.status.textContent = s.slikeKoristeno !== undefined
				? 'Postavka za slike je promijenjena, prebrojite ponovno'
				: (this.radi ? 'Čeka na red' : 'Spremno za izračun');
		}
		else if (s.stanje === 'greska') d.status.textContent = s.napomena;
		else if (s.stanje === 'gotovo') {
			if (this.javno) {
				// Zasebni dokument: stranice i stručnost; datoteka unutar spojenog dokumenta: bez pojedinosti.
				var p = vise ? null : this.podaciDokumenta(g);
				d.status.textContent = vise ? '' :
					(p.stranice ? p.stranice + ' ' + mnozina(p.stranice, 'stranica', 'stranice', 'stranica') : '') +
					(p.strucno ? (p.stranice ? ', ' : '') + 'stručni tekst (' + p.strucno.naziv + ')' : '');
			} else {
				d.status.textContent = s.rucno ? s.napomena + ', ručno ispravljeno' : s.napomena;
			}
			if (document.activeElement !== d.unos) d.unos.value = s.znakova;
			var tocno = s.znakova / this.cfg.znakova + (s.fiksno || 0);
			// Zasebni dokument prikazuje obračunske kartice (najmanje 1); datoteka u spojenom dokumentu svoje.
			var prikaz = vise ? this.zaokruzi(tocno) : this.obracunskeKartice(g);
			d.rez.textContent = this.prikaziKartice(prikaz);
			d.rezJed.textContent = ' ' + this.oznakaKartica(prikaz);
			d.rez.title = this.cfg.korak && !this.javno ? 'Točno ' + fmt(tocno, 2) + ' kartica' : '';
		}
		if (s.stanje !== 'gotovo') d.rez.textContent = '–';
		// Dok datoteka nije prebrojana, broj kartica se ne prikazuje.
		d.rez.parentNode.hidden = s.stanje !== 'gotovo';
		if (!bezDokumenta && g) this.osvjeziDokument(g);
	};

	// Zaglavlje spojenog dokumenta: ukupno stranica, stručnost i kartice za cijeli dokument.
	/* ---------- Pretvaranje u Word (privatna stranica prevoditelja) ---------- */

	Kalkulator.prototype.gumbPretvorbe = function (g) {
		var self = this;
		var b = el('button', 'kk-mali-gumb kk-pretvori');
		b.type = 'button';
		b.innerHTML = IKONA_PREUZIMANJA + '<span>Pretvori u Word</span>';
		b.title = 'Pretvori dokument u Word datoteku';
		b.addEventListener('click', function () { self.pretvoriUWord(g); });
		g.dom = g.dom || {};
		g.dom.gumbPretvorbe = b;
		if (g.pretvorba && g.pretvorba.stanje === 'radi') b.disabled = true;
		return b;
	};

	Kalkulator.prototype.osvjeziPretvorbu = function (g) {
		var st = g.pretvorba;
		if (!g.dom) return;
		if (g.dom.pretvorba) {
			g.dom.pretvorba.textContent = st ? st.opis + (st.stanje === 'radi' && st.napredak ? ' ' + Math.round(st.napredak * 100) + ' %' : '') : '';
			g.dom.pretvorba.className = 'kk-pretvorba-status' + (st && st.stanje === 'greska' ? ' kk-pretvorba-status--greska' : '');
		}
		if (g.dom.gumbPretvorbe) g.dom.gumbPretvorbe.disabled = !!(st && st.stanje === 'radi');
	};

	Kalkulator.prototype.nacrtajTrakuPrevoditelja = function () {
		var c = this.cfg.pretvaranje, self = this; // self se koristi i u izboru načina
		if (!c) return;
		var t = el('div', 'kk-prevoditelj-traka');
		// Način pretvaranja u Word; izbor se pamti na ovom uređaju.
		var nacini = el('div', 'kk-prevoditelj-nacini');
		nacini.setAttribute('role', 'radiogroup');
		nacini.setAttribute('aria-label', 'Način pretvaranja u Word');
		var zapamceno = '';
		try { zapamceno = localStorage.getItem('kk-nacin-pretvaranja') || ''; } catch (e) { /* bez pamćenja */ }
		this.nacinPretvaranja = zapamceno === 'adobe' || zapamceno === 'jednostavno' ? zapamceno : (c.adobe ? 'adobe' : 'jednostavno');
		if (!c.adobe) this.nacinPretvaranja = 'jednostavno';
		[
			{ v: 'adobe', naziv: 'Adobe s OCR-om', opis: 'izgled kao izvornik' },
			{ v: 'jednostavno', naziv: 'Pojednostavljeni Word', opis: 'prepoznavanje i brojanje u pregledniku' }
		].forEach(function (n) {
			var lab = el('label', 'kk-prevoditelj-nacin');
			var r = el('input');
			r.type = 'radio';
			r.name = (self.k.id || 'kk') + '-nacin';
			r.value = n.v;
			r.checked = self.nacinPretvaranja === n.v;
			if (n.v === 'adobe' && !c.adobe) r.disabled = true;
			r.addEventListener('change', function () {
				if (!r.checked) return;
				self.nacinPretvaranja = n.v;
				try { localStorage.setItem('kk-nacin-pretvaranja', n.v); } catch (e) { /* bez pamćenja */ }
				self.osvjeziTrakuPrevoditelja();
			});
			var tekst = el('span', null, n.naziv);
			tekst.appendChild(el('small', null, n.v === 'adobe' && !c.adobe ? ' (nije postavljen)' : ' – ' + n.opis));
			lab.appendChild(r);
			lab.appendChild(tekst);
			nacini.appendChild(lab);
		});
		t.appendChild(nacini);
		var opis = el('p', 'kk-prevoditelj-opis');
		t.appendChild(opis);
		var lab = el('label', 'kk-prevoditelj-jezik');
		lab.appendChild(el('span', null, 'Jezik dokumenata za OCR: '));
		var sel = el('select');
		Object.keys(c.jezici).forEach(function (k) {
			var o = el('option', null, c.jezici[k]);
			o.value = k;
			if (k === c.jezik) o.selected = true;
			sel.appendChild(o);
		});
		lab.appendChild(sel);
		t.appendChild(lab);
		this.$.zona.parentNode.insertBefore(t, this.$.zona.nextSibling);
		this.$.traka = { opis: opis, jezik: sel, jezikOkvir: lab };
		this.osvjeziTrakuPrevoditelja();
	};

	Kalkulator.prototype.osvjeziTrakuPrevoditelja = function () {
		var c = this.cfg.pretvaranje;
		if (!c || !this.$.traka) return;
		var t;
		if (this.nacinPretvaranja === 'jednostavno') t = 'Word s pročitanim tekstom, izrađen u pregledniku. Ne troši Adobe operacije.';
		else if (c.iscrpljeno || (c.limit && c.broj >= c.limit)) t = 'Mjesečna kvota Adobea je potrošena (' + c.broj + ' / ' + c.limit + '): izrađuje se pojednostavljeni Word.';
		else t = 'Adobe: OCR pa Word s izgledom izvornika. Ovaj mjesec potrošeno ' + c.broj + ' / ' + c.limit + ' operacija.';
		this.$.traka.opis.textContent = t;
		// Jezik za OCR treba samo Adobeu; pojednostavljeni Word koristi jezike iz postavki plugina.
		if (this.$.traka.jezikOkvir) this.$.traka.jezikOkvir.hidden = this.nacinPretvaranja === 'jednostavno';
	};

	function imeZaWord(g) {
		return String(g.stavke[0].ime).replace(/\.[^.]+$/, '') + (g.stavke.length > 1 ? ' (' + g.stavke.length + ' str.)' : '');
	}

	function pricekaj(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

	Kalkulator.prototype.pretvoriUWord = async function (g) {
		var self = this, c = this.cfg.pretvaranje;
		if (!c || (g.pretvorba && g.pretvorba.stanje === 'radi')) return;
		var st = g.pretvorba = { stanje: 'radi', opis: 'Pripremam pretvaranje…', napredak: 0 };
		this.osvjeziPretvorbu(g);
		var ime = imeZaWord(g), razlog = '';
		try {
			// Izvornik koji je već .docx preuzima se bez izmjena: to je najvjernija moguća verzija.
			if (g.stavke.length === 1 && /\.docx$/i.test(g.stavke[0].ime) && g.stavke[0].datoteka) {
				spremi(g.stavke[0].datoteka, g.stavke[0].ime);
				st.stanje = 'gotovo';
				st.opis = 'Izvornik je već Word datoteka i preuzet je bez izmjena.';
				this.osvjeziPretvorbu(g);
				return;
			}
			if (this.nacinPretvaranja === 'jednostavno') {
				await this.pretvoriLokalno(g, ime, '', true);
				return;
			}
			if (c.adobe && !c.iscrpljeno && !(c.limit && c.broj >= c.limit) && c.url) {
				var fd = new FormData();
				g.stavke.forEach(function (s) { if (s.datoteka) fd.append('datoteke[]', s.datoteka, s.ime); });
				// Dodatni OCR korak treba skenovima i fotografijama; digitalni PDF-ovi (s tekstom) idu bez njega.
				var trebaOcr = g.stavke.some(function (s) {
					return s.vrsta !== 'pdf' || s.stanje !== 'gotovo' || /OCR|skenirano/i.test(s.napomena || '');
				});
				fd.append('ocr', trebaOcr ? '1' : '0');
				fd.append('jezik', this.$.traka ? this.$.traka.jezik.value : c.jezik);
				fd.append('ime', ime);
				var zaglavlja = {};
				var r = await (await fetch(c.url, { method: 'POST', body: fd, headers: zaglavlja, credentials: 'same-origin' })).json();
				if (r && r.posao) {
					st.opis = r.opis || 'Učitavam dokument na Adobe…';
					st.napredak = r.napredak || 0.05;
					this.osvjeziPretvorbu(g);
					for (var i = 0; i < 300; i++) {
						await pricekaj(2500);
						var o = await (await fetch(c.url + '/' + r.posao, { headers: zaglavlja, credentials: 'same-origin' })).json();
						if (o && o.adobe) { c.broj = o.adobe.broj; c.limit = o.adobe.limit; this.osvjeziTrakuPrevoditelja(); }
						if (o && o.stanje === 'gotovo' && o.word) {
							var odg = await fetch(o.word, { headers: zaglavlja, credentials: 'same-origin' });
							if (!odg.ok) throw new Error('Word datoteka se nije mogla preuzeti s poslužitelja.');
							spremi(await odg.blob(), ime + '.docx');
							st.stanje = 'gotovo';
							st.opis = 'Word (izgled kao izvornik) je preuzet.';
							this.osvjeziPretvorbu(g);
							return;
						}
						if (!o || o.stanje === 'greska') {
							razlog = (o && o.poruka) || 'Adobe nije uspio pretvoriti dokument.';
							if (o && o.kvota) { c.iscrpljeno = true; this.osvjeziTrakuPrevoditelja(); }
							break;
						}
						st.opis = o.opis || st.opis;
						st.napredak = o.napredak || st.napredak;
						this.osvjeziPretvorbu(g);
					}
				} else {
					razlog = (r && (r.poruka || r.greska || r.message)) || 'Adobe trenutno nije dostupan.';
				}
			} else if (c.adobe) {
				razlog = 'mjesečna kvota Adobea je potrošena';
			}
		} catch (e) {
			razlog = (e && e.message) || 'veza s poslužiteljem nije uspjela';
		}
		await this.pretvoriLokalno(g, ime, razlog);
	};

	// Varijanta A: pojednostavljeni Word iz pročitanog teksta (bez Adobea).
	Kalkulator.prototype.pretvoriLokalno = async function (g, ime, razlog, odabrano) {
		var st = g.pretvorba, self = this;
		razlog = String(razlog || '').replace(/[.\s]+$/, '');
		// Datoteke koje još nisu pročitane čitaju se sada (prepoznavanje i brojanje znakova u pregledniku).
		var nisu = g.stavke.filter(function (s) { return s.stanje === 'cekanje'; });
		if (nisu.length) {
			if (this.radi) {
				st.stanje = 'greska';
				st.opis = 'Pričekajte da se završi brojanje pa ponovno kliknite „Pretvori u Word”.';
				this.osvjeziPretvorbu(g);
				return;
			}
			this.radi = true;
			this.napredak = { gotovo: 0, ukupno: nisu.length, trenutna: 0 };
			this.osvjeziZbroj();
			for (var i = 0; i < nisu.length; i++) {
				st.opis = 'Čitam i brojim znakove (' + (i + 1) + ' od ' + nisu.length + ')…';
				this.osvjeziPretvorbu(g);
				await this.obradi(nisu[i]);
				this.napredak.gotovo++;
				this.napredak.trenutna = 0;
			}
			this.radi = false;
			this.napredak = null;
			this.osvjeziZbroj();
		}
		if (!g.stavke.some(function (s) { return s.stanje === 'gotovo'; })) {
			st.stanje = 'greska';
			st.opis = 'Dokument se nije mogao pročitati.';
			this.osvjeziPretvorbu(g);
			return;
		}
		var odlomci = [];
		g.stavke.forEach(function (s) {
			var o = s.odlomciIzvorni || s.odlomci || [];
			if (odlomci.length && o.length) odlomci.push(PRIJELOM);
			Array.prototype.push.apply(odlomci, o);
		});
		try {
			spremi(await napraviDocx(odlomci), ime + ' (pojednostavljeno).docx');
			var p = this.podaciDokumenta(g);
			st.stanje = 'gotovo';
			st.opis = 'Pojednostavljeni Word je preuzet (' + fmt(p.znakova, 0) + ' ' + mnozina(p.znakova, 'znak', 'znaka', 'znakova') + ' s razmacima)' +
				(razlog ? '; Adobe: ' + razlog : '') + '.';
		} catch (e) {
			st.stanje = 'greska';
			st.opis = 'Word datoteka se nije mogla izraditi.';
		}
		this.osvjeziPretvorbu(g);
	};

	Kalkulator.prototype.osvjeziDokument = function (g) {
		if (!g.dom || !g.dom.status) return;
		var p = this.podaciDokumenta(g);
		var greske = g.stavke.filter(function (s) { return s.stanje === 'greska'; }).length;
		var t = '';
		if (p.cekaju) t = this.radi ? 'Obrada u tijeku' : 'Spremno za izračun';
		else if (p.gotovih) {
			t = p.stranice + ' ' + mnozina(p.stranice, 'stranica', 'stranice', 'stranica') +
				(p.strucno ? ', stručni tekst (' + p.strucno.naziv + ')' : '') +
				(greske ? ', ' + greske + ' ' + mnozina(greske, 'datoteka nije pročitana', 'datoteke nisu pročitane', 'datoteka nije pročitano') : '') +
				(this.javno ? '' : '; ukupno ' + fmt(p.znakova, 0) + ' ' + mnozina(p.znakova, 'znak', 'znaka', 'znakova') + ' s razmacima');
		} else if (greske) t = 'Datoteke se ne mogu pročitati';
		g.dom.status.textContent = t;
		if (p.gotovih && !p.cekaju) {
			var ko = this.obracunskeKartice(g, p);
			g.dom.rez.textContent = this.prikaziKartice(ko);
			g.dom.rezJed.textContent = ' ' + this.oznakaKartica(ko);
		} else {
			g.dom.rez.textContent = '–';
			g.dom.rezJed.textContent = ' kartica';
		}
		g.dom.rez.parentNode.hidden = !(p.gotovih && !p.cekaju);
	};

	/* ---------- 5. Zatraži ponudu ----------
	   Izračun, podaci naručitelja i sve učitane datoteke šalju se prevoditelju (WordPress, REST ruta plugina).
	   Bez adrese za slanje (testna HTML verzija) prikazuje se pregled onoga što bi bilo poslano. */

	Kalkulator.prototype.nacrtajPonudu = function () {
		var self = this, cfg = this.cfg.ponuda;
		if (!cfg.ukljuceno || !this.$.ukupno) return;
		var id = (this.k.id || 'kk') + '-ponuda';
		var box = el('div', 'kk-ponuda');
		box.hidden = true;

		var obrazac = el('div', 'kk-ponuda-obrazac');
		var polja = el('div', 'kk-ponuda-polja');
		function polje(naziv, tip, ime, obavezno, autocomplete) {
			var w = el('div', 'kk-ponuda-polje');
			var lab = el('label', null, naziv + (obavezno ? '' : ' (neobavezno)'));
			lab.setAttribute('for', id + '-' + ime);
			var inp = el(tip === 'textarea' ? 'textarea' : 'input');
			if (tip !== 'textarea') inp.type = tip;
			else inp.rows = 3;
			inp.id = id + '-' + ime;
			inp.name = ime;
			if (autocomplete) inp.autocomplete = autocomplete;
			var gr = el('p', 'kk-ponuda-greska');
			gr.hidden = true;
			gr.id = inp.id + '-greska';
			inp.setAttribute('aria-describedby', gr.id);
			inp.addEventListener('input', function () { gr.hidden = true; w.classList.remove('kk-ponuda-polje--greska'); });
			w.appendChild(lab);
			w.appendChild(inp);
			w.appendChild(gr);
			return { omot: w, unos: inp, greska: gr };
		}
		var ime = polje('Ime i prezime', 'text', 'ime', true, 'name');
		var email = polje('E-mail adresa', 'email', 'email', true, 'email');
		var poruka = polje('Napomena za prevoditelja', 'textarea', 'napomena', false);
		poruka.omot.classList.add('kk-ponuda-polje--puno');
		poruka.unos.placeholder = 'npr. rok, jezik prijevoda ili broj primjeraka';
		polja.appendChild(ime.omot);
		polja.appendChild(email.omot);
		polja.appendChild(poruka.omot);
		obrazac.appendChild(polja);

		// Zamka za robote: skriveno polje koje ljudi ne popunjavaju.
		var zamka = el('input', 'kk-ponuda-zamka');
		zamka.type = 'text';
		zamka.name = 'web';
		zamka.tabIndex = -1;
		zamka.autocomplete = 'off';
		zamka.setAttribute('aria-hidden', 'true');
		obrazac.appendChild(zamka);

		var privolaLab = el('label', 'kk-ponuda-privola');
		var privola = el('input');
		privola.type = 'checkbox';
		privolaLab.appendChild(privola);
		var privolaTekst = el('span', null, 'Suglasan/suglasna sam da se moji podaci i učitane datoteke pošalju prevoditelju radi izrade ponude.');
		if (cfg.privatnost) {
			var veza = el('a', null, 'Pravila privatnosti');
			veza.href = cfg.privatnost;
			veza.target = '_blank';
			veza.rel = 'noopener';
			privolaTekst.appendChild(document.createTextNode(' '));
			privolaTekst.appendChild(veza);
		}
		privolaLab.appendChild(privolaTekst);
		var privolaGr = el('p', 'kk-ponuda-greska');
		privolaGr.hidden = true;
		privola.addEventListener('change', function () { privolaGr.hidden = true; });
		obrazac.appendChild(privolaLab);
		obrazac.appendChild(privolaGr);

		var tsOmot = null;
		if (cfg.turnstile) {
			tsOmot = el('div', 'kk-ponuda-turnstile');
			obrazac.appendChild(tsOmot);
		}
		obrazac.appendChild(el('p', 'kk-ponuda-napomena', 'Klikom na „5. Zatraži ponudu” izračun i sve učitane datoteke šalju se prevoditelju na provjeru, nakon čega će Vam prevoditelj na navedenu e-mail adresu dostaviti službenu ponudu.'));

		var gumb = el('button', 'kk-ponuda-gumb', '5. Zatraži ponudu');
		gumb.type = 'button';
		obrazac.appendChild(gumb);
		var status = el('p', 'kk-ponuda-status');
		status.setAttribute('role', 'status');
		status.hidden = true;
		obrazac.appendChild(status);

		var uspjeh = el('div', 'kk-ponuda-uspjeh');
		uspjeh.hidden = true;
		uspjeh.setAttribute('role', 'status');

		box.appendChild(obrazac);
		box.appendChild(uspjeh);
		this.$.ukupno.appendChild(box);

		this.$.ponuda = { box: box, obrazac: obrazac, ime: ime, email: email, poruka: poruka, zamka: zamka,
			privola: privola, privolaGr: privolaGr, gumb: gumb, status: status, uspjeh: uspjeh, turnstile: tsOmot };
		gumb.addEventListener('click', function () { self.posaljiPonudu(); });
	};

	// Obrazac se prikazuje kad postoji izračunata cijena; nakon promjene narudžbe poslani upit se "zaboravlja".
	Kalkulator.prototype.osvjeziPonudu = function () {
		var p = this.$.ponuda;
		if (!p) return;
		var spremno = !this.$.ukupno.hidden && !!this.izbor.ovjera && !!this.izbor.dostava && this.stavke.length > 0;
		p.box.hidden = !spremno;
		if (spremno) this.pripremiTurnstile();
		if (this._poslanPotpis && this._poslanPotpis !== this.potpisNarudzbe()) {
			this._poslanPotpis = null;
			p.uspjeh.hidden = true;
			p.obrazac.hidden = false;
		}
	};

	// Turnstile se iscrtava tek kad je obrazac vidljiv; većini posjetitelja ne prikazuje nikakav zadatak.
	Kalkulator.prototype.pripremiTurnstile = function () {
		var self = this, p = this.$.ponuda, cfg = this.cfg.ponuda;
		if (!cfg.turnstile || !p.turnstile || this._tsPokrenut) return;
		this._tsPokrenut = true;
		ucitaj('turnstile').then(function (ts) {
			self._tsWidget = ts.render(p.turnstile, {
				sitekey: cfg.turnstile,
				appearance: 'interaction-only',
				language: 'hr',
				callback: function (t) { self._tsToken = t; },
				'expired-callback': function () { self._tsToken = ''; },
				'error-callback': function () { self._tsToken = ''; }
			});
		}).catch(function () {
			self._tsPokrenut = false;
			self.statusPonude('Provjera da niste robot nije se mogla učitati. Provjerite internetsku vezu.', true);
		});
	};

	Kalkulator.prototype.resetirajTurnstile = function () {
		this._tsToken = '';
		if (window.turnstile && this._tsWidget !== undefined) {
			try { window.turnstile.reset(this._tsWidget); } catch (e) { /* widget više ne postoji */ }
		}
	};

	Kalkulator.prototype.potpisNarudzbe = function () {
		return JSON.stringify([this.grupe.map(function (g) { return g.stavke.map(function (s) { return s.id; }); }),
			this.izbor.ovjera, this.izbor.dostava, !!this.izbor.sken]);
	};

	// Sažetak za prevoditelja: izbor, dokumenti (s pojedinostima koje naručitelj ne vidi) i obračun kakav je prikazan.
	Kalkulator.prototype.sazetakPonude = function () {
		var self = this;
		var vrsta = this.izbor.ovjera === 'da' ? 'Ovjereni prijevod' : 'Neovjereni prijevod';
		var dostave = { osobno: 'Osobno preuzimanje', postaHr: 'Preporučena pošiljka – Republika Hrvatska',
			postaIno: 'Preporučena pošiljka – inozemstvo', mail: this.izbor.ovjera === 'da' ? 'Samo mailom (skenirani prijevod)' : 'Dostava mailom' };
		var dostava = dostave[this.izbor.dostava] || '';
		if (this.izbor.sken && this.trebaDodatakSken()) dostava += ' + dodatno slanje mailom';
		var dokumenti = this.grupe.map(function (g) {
			var p = self.podaciDokumenta(g);
			return {
				naziv: g.stavke.length > 1 ? 'Dokument od ' + g.stavke.length + ' ' + mnozina(g.stavke.length, 'datoteke', 'datoteke', 'datoteka') : g.stavke[0].ime,
				datoteke: g.stavke.map(function (s) { return s.ime; }),
				stranice: p.stranice + (p.procjena ? ' (procjena)' : ''),
				kartice: this.prikaziKartice(this.obracunskeKartice(g, p)),
				znakova: p.znakova,
				strucno: p.strucno ? p.strucno.naziv : '',
				napomene: g.stavke.map(function (s) { return s.ime + ': ' + (s.stanje === 'gotovo' ? s.napomena : (s.napomena || 'nije pročitano')); })
			};
		}, this);
		var obracun = [];
		Array.prototype.forEach.call(this.$.obracun.querySelectorAll('.kk-obracun-red'), function (r) {
			if (r.classList.contains('kk-obracun-zaglavlje')) return;
			var dijelovi = r.querySelectorAll('span');
			var iznos = r.querySelector('.kk-obracun-iznos');
			obracun.push([dijelovi[0] ? dijelovi[0].textContent : '', iznos ? iznos.textContent : '']);
		});
		var strucnoObav = this.$.obracun.querySelector('.kk-obracun-strucno-naslov');
		return {
			vrsta: vrsta,
			dostava: dostava,
			kartice: this._kartice ? this._kartice.tekst : '',
			podjela: this._kartice ? this._kartice.podjela : '',
			strucno: strucnoObav ? strucnoObav.textContent : '',
			dokumenti: dokumenti,
			obracun: obracun
		};
	};

	Kalkulator.prototype.provjeriPonudu = function () {
		var p = this.$.ponuda, ok = true, prvi = null;
		function greska(polje, tekst) {
			polje.greska.textContent = tekst;
			polje.greska.hidden = false;
			polje.omot.classList.add('kk-ponuda-polje--greska');
			if (!prvi) prvi = polje.unos;
			ok = false;
		}
		var ime = p.ime.unos.value.trim(), email = p.email.unos.value.trim();
		if (ime.length < 2) greska(p.ime, 'Upišite ime i prezime.');
		if (!email) greska(p.email, 'Upišite e-mail adresu na koju želite primiti ponudu.');
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) greska(p.email, 'E-mail adresa nije ispravna. Provjerite je li dobro upisana.');
		if (!p.privola.checked) {
			p.privolaGr.textContent = 'Za slanje upita potrebna je Vaša suglasnost.';
			p.privolaGr.hidden = false;
			ok = false;
			if (!prvi) prvi = p.privola;
		}
		var ukupno = 0;
		this.stavke.forEach(function (s) { if (s.datoteka) ukupno += s.datoteka.size; });
		var maxB = this.cfg.ponuda.maxMb * 1024 * 1024;
		if (ok && ukupno > maxB) {
			this.statusPonude('Učitane datoteke zajedno imaju ' + fmt(ukupno / 1048576, 1) + ' MB, a putem obrasca može se poslati najviše ' +
				fmt(this.cfg.ponuda.maxMb, 0) + ' MB. Pošaljite datoteke izravno e-mailom' +
				(this.cfg.ponuda.email ? ' na ' + this.cfg.ponuda.email : '') + '.', true);
			ok = false;
		}
		if (prvi) prvi.focus();
		return ok;
	};

	Kalkulator.prototype.statusPonude = function (tekst, jeGreska) {
		var s = this.$.ponuda.status;
		s.textContent = tekst || '';
		s.hidden = !tekst;
		s.classList.toggle('kk-ponuda-status--greska', !!jeGreska);
	};

	Kalkulator.prototype.posaljiPonudu = function () {
		var self = this, p = this.$.ponuda, cfg = this.cfg.ponuda;
		if (this._saljem) return;
		this.statusPonude('');
		if (!this.provjeriPonudu()) return;
		var sazetak = this.sazetakPonude();
		var ime = p.ime.unos.value.trim(), email = p.email.unos.value.trim(), napomena = p.poruka.unos.value.trim();

		function uspjelo() {
			self._poslanPotpis = self.potpisNarudzbe();
			p.obrazac.hidden = true;
			p.uspjeh.textContent = '';
			p.uspjeh.appendChild(el('p', 'kk-ponuda-uspjeh-naslov', 'Hvala, ' + ime + '! Vaš upit je poslan.'));
			p.uspjeh.appendChild(el('p', null, 'Prevoditelj će pregledati dokumente i službenu ponudu poslati na adresu ' + email + '.'));
			p.uspjeh.focus && p.uspjeh.setAttribute('tabindex', '-1');
			p.uspjeh.hidden = false;
			p.uspjeh.focus();
		}

		// Testna verzija bez poslužitelja: samo pregled onoga što bi bilo poslano.
		if (!cfg.url) {
			self._poslanPotpis = self.potpisNarudzbe();
			p.obrazac.hidden = true;
			p.uspjeh.textContent = '';
			p.uspjeh.appendChild(el('p', 'kk-ponuda-uspjeh-naslov', 'Testna verzija: upit nije poslan.'));
			p.uspjeh.appendChild(el('p', null, 'Na stranici s pluginom upit bi bio poslan na ' + (cfg.email || 'adresu iz postavki plugina') +
				', s ' + this.stavke.length + ' ' + mnozina(this.stavke.length, 'privitkom', 'privitka', 'privitaka') +
				' i ovim sadržajem:'));
			var pre = el('pre', 'kk-ponuda-pregled', this.tekstPonude(ime, email, napomena, sazetak));
			p.uspjeh.appendChild(pre);
			var natrag = el('button', 'kk-mali-gumb', 'Natrag na obrazac');
			natrag.type = 'button';
			natrag.addEventListener('click', function () { self._poslanPotpis = null; p.uspjeh.hidden = true; p.obrazac.hidden = false; });
			p.uspjeh.appendChild(natrag);
			p.uspjeh.hidden = false;
			return;
		}

		if (cfg.turnstile && !this._tsToken) {
			this.statusPonude('Pričekajte trenutak dok se dovrši provjera da niste robot, pa ponovno kliknite „5. Zatraži ponudu”.', true);
			this.pripremiTurnstile();
			return;
		}

		var datoteke = this.stavke.filter(function (s) { return s.datoteka; }).map(function (s) {
			return new File([s.datoteka], s.ime, { type: s.datoteka.type });
		});

		this._saljem = true;
		p.gumb.disabled = true;
		p.gumb.textContent = 'Šaljem…';
		function kraj() {
			self.resetirajTurnstile();
			self._saljem = false;
			p.gumb.disabled = false;
			p.gumb.textContent = '5. Zatraži ponudu';
		}
		function neuspjeh(poruka) {
			kraj();
			self.statusPonude(poruka || 'Upit se nije mogao poslati. Pokušajte ponovno ili nam pošaljite dokumente izravno e-mailom' +
				(cfg.email ? ' na ' + cfg.email : '') + '.', true);
		}

		// Next.js/Vercel: datoteke se prvo prenose izravno u Supabase Storage (/api/prijenos),
		// a zatim se šalje sam upit s oznakom prijenosa (Vercel ne prima zahtjeve veće od 4,5 MB).
		// Poslužitelj odbija upite poslane prebrzo nakon otvaranja stranice (zaštita od robota);
		// ako je naručitelj bio vrlo brz, slanje se samo malo odgodi.
		var pricekaj = Math.max(0, 9000 - (Date.now() - this._otvoreno));
		setTimeout(async function () {
			try {
				var r = await fetch('/api/prijenos/', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						izvor: 'ponuda',
						turnstile: cfg.turnstile ? self._tsToken : '',
						web: p.zamka.value,
						datoteke: datoteke.map(function (d) { return { ime: d.name, velicina: d.size }; })
					})
				});
				var o = await r.json().catch(function () { return null; });
				if (!r.ok || !o || !o.ok) return neuspjeh(o && o.poruka);

				var ukupno = datoteke.reduce(function (a, d) { return a + d.size; }, 0) || 1, gotovo = 0;
				for (var i = 0; i < datoteke.length; i++) {
					var ok = await new Promise(function (resolve) {
						var d = datoteke[i], fdd = new FormData();
						fdd.append('cacheControl', '3600');
						fdd.append('', d);
						var xhr = new XMLHttpRequest();
						xhr.open('PUT', o.prijenosi[i].url);
						xhr.setRequestHeader('x-upsert', 'false');
						xhr.upload.onprogress = function (e) {
							if (e.lengthComputable) p.gumb.textContent = 'Šaljem… ' + Math.round((gotovo + e.loaded) / ukupno * 100) + ' %';
						};
						xhr.onload = function () { gotovo += d.size; resolve(xhr.status >= 200 && xhr.status < 300); };
						xhr.onerror = function () { resolve(false); };
						xhr.send(fdd);
					});
					if (!ok) return neuspjeh('Datoteka „' + datoteke[i].name + '” nije poslana. Provjerite internetsku vezu i pokušajte ponovno.');
				}

				var fd = new FormData();
				fd.append('oznaka', o.oznaka);
				fd.append('ime', ime);
				fd.append('email', email);
				fd.append('napomena', napomena);
				fd.append('privola', '1');
				fd.append('web', p.zamka.value);
				fd.append('podaci', JSON.stringify(sazetak));
				var r2 = await fetch(cfg.url, { method: 'POST', body: fd });
				var o2 = await r2.json().catch(function () { return null; });
				if (!r2.ok || !o2 || !o2.ok) return neuspjeh(o2 && o2.poruka);
				kraj();
				uspjelo();
			} catch (e) {
				neuspjeh('Veza s poslužiteljem nije uspjela. Provjerite internetsku vezu i pokušajte ponovno.');
			}
		}, pricekaj);
	};

	// Tekstni oblik upita (za pregled u testnoj verziji; plugin na poslužitelju slaže isti sadržaj).
	Kalkulator.prototype.tekstPonude = function (ime, email, napomena, s) {
		var r = [];
		r.push('Naručitelj: ' + ime + ' <' + email + '>');
		if (napomena) r.push('Napomena: ' + napomena);
		r.push('', 'Vrsta prijevoda: ' + s.vrsta, 'Dostava: ' + s.dostava, 'Ukupno: ' + s.kartice + (s.podjela ? ' (' + s.podjela + ')' : ''));
		if (s.strucno) r.push(s.strucno);
		r.push('', 'DOKUMENTI');
		s.dokumenti.forEach(function (d, i) {
			r.push((i + 1) + '. ' + d.naziv + ' – ' + d.stranice + ' str., ' + d.kartice + ' kart., ' + fmt(d.znakova, 0) + ' znakova' + (d.strucno ? ', stručni tekst (' + d.strucno + ')' : ''));
			d.napomene.forEach(function (n) { r.push('   ' + n); });
		});
		r.push('', 'OBRAČUN');
		s.obracun.forEach(function (o) { r.push(o[0] + (o[1] ? ': ' + o[1] : '')); });
		return r.join('\n');
	};

	/* ---------- Povlačenje (SortableJS, radi i na dodirnim zaslonima) ---------- */

	Kalkulator.prototype.unistiPovlacenje = function () {
		(this._sortable || []).forEach(function (x) { try { x.destroy(); } catch (e) { /* već uništeno */ } });
		this._sortable = [];
		this._sortVerzija = (this._sortVerzija || 0) + 1;
	};

	Kalkulator.prototype.omoguciPovlacenje = function () {
		var self = this, verzija = this._sortVerzija;
		if (this.stavke.length < 2) return;
		ucitaj('sortable').then(function (Sortable) {
			if (verzija !== self._sortVerzija) return;
			var grupaIme = 'kk-' + (self.k.id || 'kk');
			function ocistiCiljeve() {
				Array.prototype.forEach.call(self.$.popis.querySelectorAll('.kk-dok--cilj'), function (x) { x.classList.remove('kk-dok--cilj'); });
			}
			var zajednicko = {
				group: grupaIme,
				animation: 150,
				// Isti način povlačenja mišem i prstom (ne oslanja se na ugrađeni drag and drop preglednika).
				forceFallback: true,
				fallbackTolerance: 4,
				fallbackOnBody: false, // kopija koja se vuče ostaje unutar kalkulatora i zadržava njegove stilove
				fallbackClass: 'kk-povlacenje-kopija',
				swapThreshold: 0.65,
				emptyInsertThreshold: 12,
				ghostClass: 'kk-povlacenje-duh',
				chosenClass: 'kk-povlacenje-odabrano',
				onMove: function (evt) {
					ocistiCiljeve();
					var cilj = evt.to && evt.to.classList.contains('kk-dok-datoteke') ? evt.to.closest('.kk-dok') : null;
					var izvor = evt.from ? evt.from.closest('.kk-dok') : null;
					if (cilj && cilj !== izvor) cilj.classList.add('kk-dok--cilj');
				},
				onEnd: function () {
					ocistiCiljeve();
					self.preuzmiRasporedIzDom();
				}
			};
			self._sortable.push(Sortable.create(self.$.popis, Object.assign({}, zajednicko, { handle: '.kk-rucka-dok', draggable: '.kk-dok, .kk-stavka' })));
			self.grupe.forEach(function (g) {
				self._sortable.push(Sortable.create(g.dom.ul, Object.assign({}, zajednicko, { handle: '.kk-rucka-dat', draggable: '.kk-stavka, .kk-dok' })));
			});
		}).catch(function () { /* bez povlačenja ostaju gumbi za spajanje i izdvajanje */ });
	};

	// Nakon povlačenja raspored se čita iz stranice: što je u istom dokumentu, postaje jedan dokument.
	Kalkulator.prototype.preuzmiRasporedIzDom = function () {
		var self = this, poId = {}, grupePoId = {}, iskoristene = {};
		this.stavke.forEach(function (s) { poId[s.id] = s; });
		this.grupe.forEach(function (g) { grupePoId[g.id] = g; });
		var nove = [];
		Array.prototype.forEach.call(this.$.popis.children, function (li) {
			var dat = li.classList.contains('kk-stavka')
				? [poId[li.dataset.id]]
				: Array.prototype.map.call(li.querySelectorAll('li.kk-stavka'), function (x) { return poId[x.dataset.id]; });
			dat = dat.filter(Boolean);
			if (!dat.length) return;
			var g = li.classList.contains('kk-dok') && grupePoId[li.dataset.grupa] && !iskoristene[li.dataset.grupa]
				? grupePoId[li.dataset.grupa] : self.novaGrupa([]);
			iskoristene[g.id] = true;
			g.stavke = dat;
			nove.push(g);
		});
		this.grupe = nove;
		setTimeout(function () { self.nacrtajPopis(); self.osvjeziZbroj(); }, 0);
	};

	/* ---------- Potvrda grupiranja ---------- */

	// Redoslijed ispod polja 1: pitanje o grupiranju s dva prečaca, popis datoteka, potvrda
	// „Grupiranje je gotovo”, koraci 2 i 3, pa gumb za izračun.
	Kalkulator.prototype.nacrtajGrupiranje = function () {
		var self = this;
		var box = el('div', 'kk-grupiranje');
		box.hidden = true;
		box.setAttribute('role', 'group');
		box.appendChild(el('p', 'kk-grupiranje-naslov', 'Pripadaju li neke datoteke istom originalu?'));
		box.appendChild(el('p', 'kk-grupiranje-opis', 'Ako se neki original sastoji od više pojedinačno učitanih stranica, povucite ih (⋮⋮) jednu na drugu da ih ponovno spojite u jedan dokument i nakon toga potvrdite odabir.'));
		var gumbi = el('div', 'kk-grupiranje-gumbi');
		function gumb(tekst, klasa, radnja) {
			var b = el('button', klasa, tekst);
			b.type = 'button';
			b.addEventListener('click', function () {
				radnja();
				self.grupiranjePotvrdeno = true;
				self.greska.grupiranje = false;
				self.nacrtajPopis();
				self.obnoviGreske();
				self.osvjeziZbroj();
			});
			return b;
		}
		gumbi.appendChild(gumb('Svaka datoteka je zaseban dokument', 'kk-gumb-sporedni', function () {
			self.grupe = self.stavke.map(function (s) { return self.novaGrupa([s]); });
		}));
		gumbi.appendChild(gumb('Sve datoteke su jedan dokument', 'kk-gumb-sporedni', function () {
			self.grupe = [self.novaGrupa(self.stavke.slice())];
		}));
		box.appendChild(gumbi);

		var potvrda = el('div', 'kk-grupiranje-potvrda');
		potvrda.hidden = true;
		potvrda.appendChild(gumb('Grupiranje je gotovo', 'kk-gumb-sporedni kk-gumb-potvrda', function () {}));

		// Pitanje, popis datoteka i potvrda u zajedničkom okviru, da se vidi da čine jednu cjelinu.
		var popis = this.$.popis;
		var okvir = el('div', 'kk-grupiranje-okvir');
		popis.parentNode.insertBefore(okvir, popis);
		okvir.appendChild(box);
		okvir.appendChild(popis);
		okvir.appendChild(potvrda);
		this.$.grupiranjeOkvir = okvir;
		// Koraci 2 i 3 dolaze nakon popisa i potvrde grupiranja, neposredno iznad gumba za izračun.
		if (this.$.narudzba) this.$.akcije.parentNode.insertBefore(this.$.narudzba, this.$.akcije);
		this.$.grupiranje = box;
		this.$.grupiranjePotvrda = potvrda;
	};

	Kalkulator.prototype.osvjeziGrupiranje = function () {
		if (!this.$.grupiranje) return;
		var skriveno = this.grupiranjePotvrdeno || this.stavke.length < 2;
		this.$.grupiranje.hidden = skriveno;
		if (this.$.grupiranjePotvrda) this.$.grupiranjePotvrda.hidden = skriveno;
		if (this.$.grupiranjeOkvir) this.$.grupiranjeOkvir.classList.toggle('kk-grupiranje-okvir--aktivno', !skriveno);
	};

	// Pokreće se gumbom: broje se sve datoteke koje čekaju, jedna za drugom.
	// Izračun je moguć tek kad su odabrani vrsta prijevoda i način dostave.
	Kalkulator.prototype.provjeriIzbor = function () {
		var g = this.greska;
		g.grupiranje = this.stavke.length >= 2 && !this.grupiranjePotvrdeno;
		if (this.cfg.cjenik && this.$.fsOvjera) {
			g.ovjera = !this.izbor.ovjera;
			g.dostava = !this.izbor.dostava;
		}
		this.obnoviGreske();
		if (!g.grupiranje && !g.ovjera && !g.dostava) return true;
		var cilj = g.grupiranje ? (this.$.grupiranjeOkvir || this.$.grupiranje) : (g.ovjera ? this.$.fsOvjera : this.$.fsDostava);
		cilj.scrollIntoView({ behavior: 'smooth', block: 'center' });
		var prvi = cilj.querySelector('input[type=radio], button');
		if (prvi) prvi.focus({ preventScroll: true });
		return false;
	};

	// Označava korake koji nedostaju i ispisuje poruku iznad gumba; nestaje čim se odabir napravi.
	Kalkulator.prototype.obnoviGreske = function () {
		var g = this.greska;
		if (this.$.fsOvjera) this.$.fsOvjera.classList.toggle('kk-skupina--greska', !!g.ovjera);
		if (this.$.fsDostava) this.$.fsDostava.classList.toggle('kk-skupina--greska', !!g.dostava);
		if (this.$.grupiranjeOkvir) this.$.grupiranjeOkvir.classList.toggle('kk-grupiranje-okvir--greska', !!g.grupiranje);
		if (this.$.grupiranjePotvrda) this.$.grupiranjePotvrda.classList.toggle('kk-grupiranje-potvrda--greska', !!g.grupiranje);
		var p = this.$.porukaGreske;
		if (!p) {
			p = this.$.porukaGreske = el('p', 'kk-greska-poruka');
			p.setAttribute('role', 'alert');
			this.$.akcije.appendChild(p);
		}
		var dijelovi = [], odabir = [];
		if (g.grupiranje) dijelovi.push('potvrdite pripadaju li datoteke istom originalu (korak 1)');
		if (g.ovjera) odabir.push('vrstu prijevoda (korak 2)');
		if (g.dostava) odabir.push('način dostave (korak 3)');
		if (odabir.length) dijelovi.push('odaberite ' + odabir.join(' i '));
		p.textContent = dijelovi.length ? 'Za izračun cijene najprije ' + dijelovi.join(', a zatim ') + '.' : '';
		p.hidden = !dijelovi.length;
	};

		Kalkulator.prototype.prebroji = async function () {
		if (this.radi) return;
		if (!this.provjeriIzbor()) return;
		var self = this;
		var red = this.stavke.filter(function (s) { return s.stanje === 'cekanje'; });
		if (!red.length) {
			// Sve je već prebrojano: ponovni izračun cijene prema trenutnom odabiru.
			this.osvjeziZbroj();
			this.istakniRezultat();
			return;
		}
		this.radi = true;
		this.napredak = { gotovo: 0, ukupno: red.length };
		red.forEach(function (s) { self.osvjeziStavku(s); });
		this.osvjeziZbroj();

		for (var i = 0; i < red.length; i++) {
			var s = red[i];
			if (s.uklonjena || s.stanje !== 'cekanje') { this.napredak.gotovo++; continue; }
			this.napredak.trenutna = 0;
			this.osvjeziGumbNapretka();
			await this.obradi(s);
			this.napredak.gotovo++;
			this.napredak.trenutna = 0;
			this.osvjeziGumbNapretka();
			this.osvjeziZbroj();
		}
		this.radi = false;
		this.napredak = null;
		this.stavke.forEach(function (s) { if (s.stanje === 'cekanje') self.osvjeziStavku(s); });
		this.osvjeziZbroj();
		this.istakniRezultat();
	};

	// Pomak do rezultata i kratko isticanje, da se vidi da je cijena (ponovno) izračunata.
	Kalkulator.prototype.istakniRezultat = function () {
		var u = this.$.ukupno;
		if (!u || u.hidden) return;
		u.classList.remove('kk-ukupno--osvjezeno');
		void u.offsetWidth;
		u.classList.add('kk-ukupno--osvjezeno');
		var r = u.getBoundingClientRect();
		if (r.top < 0 || r.bottom > (window.innerHeight || document.documentElement.clientHeight)) {
			u.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	};

	Kalkulator.prototype.obradi = async function (s) {
		var self = this;
		s.stanje = 'obrada';
		s.slikeKoristeno = this.slike;
		s.ponovi = false;
		this.osvjeziStavku(s);
		this.osvjeziZbroj();

		// Napredak datoteke dijeli se na jedinice (stranice PDF-a, slike u dokumentu). Unutar jedinice može biti više
		// prepoznavanja teksta (OCR), svako s vlastitim napretkom 0–100 %, pa se oni ne smiju miješati s napretkom
		// cijele datoteke: k-to prepoznavanje u jedinici dovodi je najviše do 1 − 0,5^k, a jedinica je gotova tek kad
		// čitač prijeđe na sljedeću. Zato napredak nikad ne dosegne 100 % prije kraja obrade.
		var u = { i: 0, n: 1, rec: 0, ocr: 0 };
		function prijavi() {
			var baza = 1 - Math.pow(0.5, u.rec);
			var unutar = baza + (1 - baza) * 0.5 * Math.max(0, Math.min(1, u.ocr));
			var p = Math.max(0, Math.min(0.98, (u.i + unutar) / u.n));
			s.dom.traka.style.width = Math.round(p * 100) + '%';
			if (self.napredak && p > (self.napredak.trenutna || 0)) {
				self.napredak.trenutna = p;
				self.osvjeziGumbNapretka();
			}
		}
		var ctx = {
			jezici: this.cfg.jezici,
			slike: this.slike,
			status: function (t) { s.dom.status.textContent = t; },
			jedinica: function (i, n) { u = { i: Math.max(0, i), n: Math.max(1, n), rec: 0, ocr: 0 }; prijavi(); },
			ocrNapredak: function (p) { u.ocr = p; prijavi(); },
			ocrKraj: function () { u.rec++; u.ocr = 0; prijavi(); },
			napredak: function () { prijavi(); }
		};
		ctx.status('Čitam datoteku…');
		ctx.napredak(0);

		try {
			var r = await CITACI[s.vrsta](s.datoteka, ctx);
			var std = primijeniStandardneDijelove(r.odlomci);
			s.odlomci = std.odlomci;
			s.odlomciIzvorni = r.odlomci;
			s.znakova = zbrojiOdlomke(std.odlomci);
			s.fiksno = std.fiksno;
			s.napomena = r.napomena + std.napomena;
			s.strucno = prepoznajStrucno(std.odlomci);
			if (s.strucno) s.napomena += '; prepoznat kao stručni tekst (' + s.strucno.naziv + ')';
			// Broj stranica izvornika (za skeniranje ovjerenog prijevoda); kad ga datoteka ne sadrži, procjenjuje se.
			if (r.stranice) { s.stranice = r.stranice; s.straniceProcjena = false; }
			else { s.stranice = Math.max(1, Math.ceil(s.znakova / this.cfg.znakova)); s.straniceProcjena = true; }
			if (s.vrsta !== 'pdf' && s.vrsta !== 'slika') {
				s.napomena += '; ' + s.stranice + ' ' + mnozina(s.stranice, 'stranica', 'stranice', 'stranica') + (s.straniceProcjena ? ' (procjena)' : '');
			}
			if (s.znakova === 0 && !s.fiksno) s.napomena += ', tekst nije pronađen';
			s.stanje = 'gotovo';
		} catch (e) {
			s.stanje = 'greska';
			s.napomena = (e && e.message) || 'Datoteka se ne može pročitati.';
		}
		aktivniLogger = null;
		if (s.ponovi && s.stanje === 'gotovo') { s.stanje = 'cekanje'; s.ponovi = false; }
		if (!s.uklonjena) this.osvjeziStavku(s);
	};

	// Gumb tijekom obrade: puni se bojom slijeva nadesno prema napretku svih datoteka.
	Kalkulator.prototype.osvjeziGumbNapretka = function () {
		var b = this.$.pokreni, n = this.napredak;
		if (!b || !this.radi || !n) return;
		// Dok obrada traje, gumb nikad ne pokazuje 100 %.
		var udio = n.ukupno ? Math.min(0.99, (n.gotovo + Math.min(1, n.trenutna || 0)) / n.ukupno) : 0;
		var posto = Math.round(udio * 100);
		b.classList.add('kk-pokreni--radi');
		b.style.setProperty('--kk-napredak', (udio * 100).toFixed(1) + '%');
		b.textContent = 'Računam… ' + posto + ' %';
	};

	Kalkulator.prototype.osvjeziZbroj = function () {
		var zbroj = 0, fiksno = 0, gotovih = 0, cekaju = 0, cfg = this.cfg;
		this.stavke.forEach(function (s) {
			if (s.stanje === 'gotovo') { zbroj += s.znakova; fiksno += s.fiksno || 0; gotovih++; }
			else if (s.stanje === 'cekanje') cekaju++;
		});

		this.osvjeziGrupiranje();
		// Koraci 2 i 3 (vrsta prijevoda i dostava) prikazuju se tek kad su učitane datoteke,
		// pa kalkulator na naslovnici u početku zauzima malo mjesta.
		if (this.$.narudzba && this.cfg.cjenik) this.$.narudzba.hidden = this.stavke.length === 0;

		// Gumbi i obavijest
		this.$.akcije.hidden = this.stavke.length === 0;
		// Gumb je aktivan i nakon izračuna, da se cijena može ponovno izračunati nakon promjene odabira.
		this.$.pokreni.disabled = this.radi || (cekaju === 0 && gotovih === 0);
		if (this.radi) this.osvjeziGumbNapretka();
		else {
			this.$.pokreni.textContent = '4. Izračunaj cijenu';
			this.$.pokreni.classList.remove('kk-pokreni--radi');
			this.$.pokreni.style.removeProperty('--kk-napredak');
		}
		this.$.ocisti.disabled = this.radi;
		var info = '';
		if (this.radi && this.napredak) {
			info = 'Brojim datoteku ' + Math.min(this.napredak.gotovo + 1, this.napredak.ukupno) + ' od ' + this.napredak.ukupno + '…';
		} else if (cekaju) {
			info = cekaju + ' ' + mnozina(cekaju, 'datoteka čeka', 'datoteke čekaju', 'datoteka čeka') + ' na izračun. Kad dodate sve datoteke i odaberete postavke, kliknite „Izračunaj cijenu”.';
		}
		this.$.info.textContent = info;

		// Ukupno
		// Rezultat se skriva čim na popisu postoji neprebrojana datoteka (npr. naknadno dodan dokument),
		// jer prikazana cijena tada više ne vrijedi; ponovno se prikazuje nakon klika na „Izračunaj cijenu”.
		this.$.ukupno.hidden = gotovih === 0 || cekaju > 0 || this.radi;
		var kartice = zbroj / cfg.znakova + fiksno;
		// Ukupno je zbroj obračunskih kartica po dokumentima; standardni i stručni tekstovi iskazuju se zasebno.
		var self = this, zaokruzeno = 0, strucneObr = 0;
		this.grupe.forEach(function (g) {
			var p = self.podaciDokumenta(g), k = self.obracunskeKartice(g, p);
			zaokruzeno += k;
			if (k && p.strucno) strucneObr += k;
		});
		// Podaci o karticama za e-mail prevoditelju (klijentu se ne prikazuju).
		this._kartice = {
			tekst: this.prikaziKartice(zaokruzeno) + ' ' + this.oznakaKartica(zaokruzeno),
			podjela: strucneObr
				? (strucneObr < zaokruzeno ? 'standardni tekst: ' + karticeTekst(zaokruzeno - strucneObr) + '; ' : '') + 'stručni tekst: ' + karticeTekst(strucneObr)
				: ''
		};
		this.$.broj.textContent = this.prikaziKartice(zaokruzeno);
		var oznaka = this.k.querySelector('.kk-kartice-oznaka');
		if (oznaka) oznaka.textContent = this.oznakaKartica(zaokruzeno);
		if (!this.$.podjela) {
			this.$.podjela = el('p', 'kk-kartice-podjela');
			var kk = this.k.querySelector('.kk-kartice');
			if (kk) kk.parentNode.insertBefore(this.$.podjela, kk.nextSibling);
		}
		// Jedno ispod drugoga: standardni tekst / stručni tekst.
		this.$.podjela.textContent = '';
		if (strucneObr) {
			if (strucneObr < zaokruzeno) {
				this.$.podjela.appendChild(el('span', null, 'standardni tekst: ' + karticeTekst(zaokruzeno - strucneObr)));
				this.$.podjela.appendChild(document.createElement('br'));
			}
			this.$.podjela.appendChild(el('span', null, 'stručni tekst: ' + karticeTekst(strucneObr)));
		}
		this.$.podjela.hidden = !strucneObr;

		var t = 'Ukupno ' + fmt(zbroj, 0) + ' ' + mnozina(zbroj, 'znak', 'znaka', 'znakova') + ' s razmacima';
		if (fiksno) t += ' + ' + karticeTekst(fiksno) + ' za prepoznate e-ovjere';
		if (cfg.korak && Math.abs(zaokruzeno - kartice) > 1e-9) t += ', točno ' + fmt(kartice, 2) + ' kartica (obračun po dokumentima, najmanje ' + karticeTekst(cfg.minKartica) + ' po dokumentu)';
		if (cekaju && !this.radi) t += ' (bez ' + cekaju + ' ' + mnozina(cekaju, 'datoteke', 'datoteke', 'datoteka') + ' koje još nisu prebrojane)';
		this.$.znakovi.textContent = t;
		this.$.znakovi.hidden = this.javno;

		if (cfg.cjenik) {
			this.osvjeziObracun(zaokruzeno, strucneObr);
		} else if (cfg.cijena > 0 && this.$.cijena) {
			this.$.cijena.hidden = false;
			this.$.cijena.textContent = 'Okvirna cijena: ' + fmt(zaokruzeno * cfg.cijena, 2) + (cfg.valuta ? ' ' + cfg.valuta : '');
		}

		// Ikona lista prikazuje koliko je popunjena zadnja (započeta) kartica.
		var ostatak = kartice % 1;
		var udio = kartice === 0 ? 0 : (ostatak < 1e-9 ? 1 : ostatak);
		this.$.ispuna.setAttribute('y', String(60 * (1 - udio)));
		this.$.ispuna.setAttribute('height', String(60 * udio));
		this.$.list.setAttribute('aria-label', 'Zadnja kartica popunjena ' + Math.round(udio * 100) + ' %');
		this.osvjeziPonudu();
	};

	function pokreni() {
		document.querySelectorAll('.kk:not([data-kk-spreman])').forEach(function (k) {
			k.setAttribute('data-kk-spreman', '');
			new Kalkulator(k);
		});
	}

	// Next.js: komponenta poziva window.kkPokreni nakon navigacije na stranicu s kalkulatorom.
	window.kkPokreni = pokreni;
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pokreni);
	else pokreni();
})();
