import {
  buildImgeProductUrl,
  buildImgeSearchUrl,
  extractImgeSlug,
  isbnFromImgeSlug,
  parseImgeSearchResults,
  toNamedResults,
} from '../src/imge/scraper';

function row(product: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    barkod: product.barkod,
    uretici_ad: 'Yapı Kredi Yayınları ( YKY )',
    kategori_ad: 'Mektup - Günlük',
    ...extra,
    product_json: product,
  };
}

const LETTERS = {
  barkod: '9789750868610',
  stokcins: 'Hepinizi Hasretle Öperim;Samet Ağaoğlu’nun Cezaevi Yıllarındaki Aile Mektupları',
  seo_link: 'hepinizi-hasretle-operim-samet-agaoglu-9789750868610',
  ozet: 'Sevgili Tezer,\r\nBugün doğum günüm.\r\n\r\n \r\n\r\nSamet Ağaoğlu',
  sayfasayisi: 184,
  baskino: 1,
  stk_date_print: '2026-09-03',
  yayin_dili: { id: 73, ln_name: 'Türkçe' },
  authors: [
    { at_name: 'Samet Ağaoğlu', at_who: 0 },
    { at_name: 'Azize F. Çakır', at_who: 8 },
    { at_name: 'Banu İşlet', at_who: 2 },
  ],
  files: [
    { fl_type: 1, fl_sort: 1, fl_url: 'https://cdn.kibo.com.tr/temp/back.png' },
    { fl_type: 1, fl_sort: 0, fl_url: 'https://cdn.kibo.com.tr/temp/front.png' },
  ],
};

function response(rows: unknown[]) {
  return { KiboApp: { Response: { kiboCode: 1, data: { rowCount: rows.length, list: rows } } } };
}

describe('imge scraper', () => {
  it('reads a book straight from a search row', () => {
    expect(parseImgeSearchResults(response([row(LETTERS)]))).toEqual([
      {
        providerId: 'hepinizi-hasretle-operim-samet-agaoglu-9789750868610',
        title: 'Hepinizi Hasretle Öperim',
        subtitle: 'Samet Ağaoğlu’nun Cezaevi Yıllarındaki Aile Mektupları',
        authors: ['Samet Ağaoğlu'],
        publisher: 'Yapı Kredi Yayınları (YKY)',
        description: 'Sevgili Tezer,\nBugün doğum günüm.\n\nSamet Ağaoğlu',
        publishedDate: '2026-09-03',
        language: 'tr',
        pageCount: 184,
        isbn13: '9789750868610',
        genres: ['Mektup - Günlük'],
        coverUrl: 'https://cdn.kibo.com.tr/temp/front.png',
      },
    ]);
  });

  it('does not date a reprint by its latest printing', () => {
    const [book] = parseImgeSearchResults(response([row({ ...LETTERS, baskino: 54 })]));
    expect(book?.publishedDate).toBeUndefined();
  });

  it('keeps only rows whose barcode is a book ISBN, once each', () => {
    const magazine = { ...LETTERS, barkod: '9771301234005', seo_link: 'dergi-9771301234005' };
    const bad = { ...LETTERS, barkod: '9789750868611', seo_link: 'kotu-isbn' };
    const unsafe = { ...LETTERS, seo_link: '../../x' };
    const books = parseImgeSearchResults(response([row(LETTERS), row(magazine), row(bad), row(unsafe), row(LETTERS)]));
    expect(books.map((book) => book.providerId)).toEqual(['hepinizi-hasretle-operim-samet-agaoglu-9789750868610']);
  });

  it('survives a response without a list', () => {
    expect(parseImgeSearchResults({ KiboApp: { Response: { kiboCode: 0 } } })).toEqual([]);
    expect(parseImgeSearchResults(null)).toEqual([]);
  });

  it('names results by their title for matching', () => {
    expect(toNamedResults(parseImgeSearchResults(response([row(LETTERS)])))).toEqual([
      { slug: 'hepinizi-hasretle-operim-samet-agaoglu-9789750868610', name: 'Hepinizi Hasretle Öperim' },
    ]);
  });

  it('reads slugs and the ISBN they end with', () => {
    expect(extractImgeSlug('https://www.imge.com.tr/urun/serenad-zulfu-livaneli-9786050900286')).toBe('serenad-zulfu-livaneli-9786050900286');
    expect(extractImgeSlug('../x')).toBeUndefined();
    expect(isbnFromImgeSlug('serenad-zulfu-livaneli-9786050900286')).toBe('9786050900286');
    expect(isbnFromImgeSlug('serenad')).toBeUndefined();
  });

  it('builds urls', () => {
    expect(buildImgeSearchUrl('Serenad Zülfü Livaneli', 20)).toBe(
      'https://b2bapi.onsocloud.com/api/public/product/search?search_text=Serenad+Z%C3%BClf%C3%BC+Livaneli&sort_type=0&limit=20&page=1',
    );
    expect(buildImgeProductUrl('serenad')).toBe('https://www.imge.com.tr/urun/serenad');
  });
});
