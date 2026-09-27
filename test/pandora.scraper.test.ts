import { extractPandoraId, extractPandoraIsbnMatches, extractPandoraSearchIds, parsePandoraProduct } from '../src/pandora/scraper';

const PRODUCT = {
  Baslik: 'Sefiller',
  Kitap: {
    id: '988502',
    adi: 'Sefiller : Cilt 1',
    ean: '9786258807356',
    yayintarih: '2026-08-27T16:03:00',
    Yayinci: 'Paradigma Akademi',
    dizi: 'Klasikler',
    dili: 'Türkçe',
    sayfa: '154',
    yazar: 'Hugo, Victor',
    tanitim: '<p>Birinci <b>bölüm</b></p>',
    tanitim2: null,
    tanitim3: null,
  },
  Yazarlar: [
    { yazar: 'Çeviren, Ali', tip: 'Çevirmen', asil: 0 },
    { yazar: 'Hugo, Victor', tip: 'Yazar', asil: 1 },
  ],
  Turler: [{ turadi: 'ROMAN- ÖYKÜ' }, { turadi: 'ROMAN- ÖYKÜ' }],
  gorselUrl: 'https://cdn.pandora.com.tr/images/urun/988/988502b.jpg',
};

describe('pandora scraper', () => {
  it('parses a product payload', () => {
    expect(parsePandoraProduct(PRODUCT, '1')).toEqual({
      providerId: '988502',
      title: 'Sefiller: Cilt 1',
      authors: ['Victor Hugo'],
      publisher: 'Paradigma Akademi',
      seriesName: 'Klasikler',
      description: 'Birinci bölüm',
      publishedDate: '2026-08-27',
      language: 'tr',
      pageCount: 154,
      isbn13: '9786258807356',
      genres: ['Roman-Öykü'],
      coverUrl: 'https://cdn.pandora.com.tr/images/urun/988/988502b.jpg',
    });
  });

  it('falls back to the primary author field and a derived cover url', () => {
    const parsed = parsePandoraProduct({ Kitap: { id: '2500', adi: 'A', yazar: 'Soyad, Ad' }, Yazarlar: [{ yazar: 'X, Y', tip: 'Editör' }] }, '2500');
    expect(parsed?.authors).toEqual(['Ad Soyad']);
    expect(parsed?.coverUrl).toBe('https://cdn.pandora.com.tr/images/urun/2/2500b.jpg');
  });

  it('returns null for a payload without a book', () => {
    expect(parsePandoraProduct({ success: false }, '1')).toBeNull();
  });

  it('extracts search ids and exact ISBN matches', () => {
    const data = { Urunler: [{ id: 1, ean: '9786258807356' }, { id: 2, ean: '9789750719387' }, { id: 1 }, { id: 'x' }] };
    expect(extractPandoraSearchIds(data, 10)).toEqual(['1', '2']);
    expect(extractPandoraSearchIds(data, 1)).toEqual(['1']);
    expect(extractPandoraIsbnMatches(data, '9789750719387')).toEqual(['2']);
    expect(extractPandoraSearchIds(null, 5)).toEqual([]);
  });

  it('extracts ids from urls and bare ids', () => {
    expect(extractPandoraId('https://www.pandora.com.tr/kitap/sefiller-988502')).toBe('988502');
    expect(extractPandoraId('988502')).toBe('988502');
    expect(extractPandoraId('nope')).toBeUndefined();
  });
});
