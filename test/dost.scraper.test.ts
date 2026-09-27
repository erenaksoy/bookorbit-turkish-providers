import { buildDostProductUrl, buildDostSearchUrl, extractDostSlug, parseDostBookPage, parseDostSearchResults } from '../src/dost/scraper';
import { preferAuthor } from '../src/shared/turkish-bookstore';

const BOOK_HTML = `
  <meta property="og:title" content="Serenad" />
  <meta property="og:description" content="SERENAD *&#x130;NKILAP*" />
  <meta property="og:image" content="https://dostkitabevi.com/images/thumbs/0221676_serenad_550.jpeg" />
  <ol class="breadcrumb">
    <li class="breadcrumb-item"><a href="/"> Anasayfa </a></li>
    <li class="breadcrumb-item"><a href="/kitap"><span itemprop="name">Kitap</span></a></li>
    <li class="breadcrumb-item"><a href="/edebiyat"><span itemprop="name">Edebiyat</span></a></li>
    <li class="breadcrumb-item"><a href="/turk"><span itemprop="name">T&#xFC;rk Edebiyat&#x131;</span></a></li>
    <li class="breadcrumb-item"><strong class="current-item" itemprop="name">Serenad</strong></li>
  </ol>
  <div class="manufacturers"> <span class="yazaradidiv"><strong>Yazar:</strong></span>
    <span class="value"> <a href="/z&#xFC;lf&#xFC;-livaneli">Z&#xFC;lf&#xFC; Livaneli</a> </span> </div>
  <div class="additional-details">
    <div class="sku"> <strong>Barkod:</strong> <span class="value" id="sku-519008">9789751042668</span> </div>
    <div class="product-vendor"> <strong>&#xDC;reticiler:</strong> <span class="value"><a href="/inkilap">&#x130;nk&#x131;lap Kitabevi</a></span> </div>
  </div>
  <div class="urun-ozellikler"> <strong>Basım Tarihi:</strong> 11-2021<br> <strong>Baskı Sayısı:</strong> 1. Basım<br>
    <strong>Sayfa Sayısı:</strong> 416 Sayfa<br> <strong>Cilt:</strong> Ciltsiz<br> <strong>Basım Dili:</strong> Türkçe<br> </div>
  <div class="container"> <div class="mb-8">
    <div class="position-relative"><ul class="nav" id="pills-tab-8" role="tablist"><li><a href="#Jpills-two-example1">Açıklama</a></li></ul></div>
    <div class="borders-radius-17 border p-4"> <p>Birinci paragraf.</p> <p>İkinci<br />satır.</p> </div>
  </div> </div>
`;

describe('dost scraper', () => {
  it('parses a product page', () => {
    expect(parseDostBookPage(BOOK_HTML, 'serenad-4')).toEqual({
      providerId: 'serenad-4',
      title: 'Serenad',
      authors: ['Zülfü Livaneli'],
      publisher: 'İnkılap Kitabevi',
      description: 'Birinci paragraf.\nİkinci\nsatır.',
      publishedYear: 2021,
      language: 'tr',
      pageCount: 416,
      isbn13: '9789751042668',
      genres: ['Edebiyat', 'Türk Edebiyatı'],
      coverUrl: 'https://dostkitabevi.com/images/thumbs/0221676_serenad_550.jpeg',
    });
  });

  it('does not date a reprint by its latest printing', () => {
    const html = BOOK_HTML.replace('1. Basım', '12. Basım');
    expect(parseDostBookPage(html, 'serenad-4').publishedYear).toBeUndefined();
  });

  it('reads no author where the slot names a musician', () => {
    const html = BOOK_HTML.replace('<strong>Yazar:</strong>', '<strong>Sanatçı:</strong>');
    expect(parseDostBookPage(html, 'serenad-4').authors).toBeUndefined();
  });

  it('keeps only books from the autocomplete, once each', () => {
    const data = [
      { label: 'Serenad', producturl: '/serenad-4', sku: '9789751042668' },
      { label: 'Serenad', producturl: '/serenad-3', sku: '8697420350826' },
      { label: 'Serenad 1000P', producturl: '/serenad-1000p', sku: '8681842207035' },
      { label: 'SERENAD BAGCAN -2LP', producturl: null, sku: '8697420350130' },
      { label: 'Engereğin Gözü', producturl: '/engere%C4%9Fin-g%C3%B6z%C3%BC-2', sku: '9789751041548' },
      { label: 'Serenad', producturl: '/serenad-4', sku: '9789751042668' },
    ];
    expect(parseDostSearchResults(data)).toEqual([
      { slug: 'serenad-4', name: 'Serenad', isbn13: '9789751042668' },
      { slug: 'engereğin-gözü-2', name: 'Engereğin Gözü', isbn13: '9789751041548' },
    ]);
    expect(parseDostSearchResults({ error: 1 })).toEqual([]);
  });

  it('prefers the requested author, but keeps everything when no name matches', () => {
    const books = [{ authors: ['Oğuz Atay'] }, { authors: ['Murat Belge'] }];
    expect(preferAuthor(books, 'Oguz Atay')).toEqual([{ authors: ['Oğuz Atay'] }]);
    expect(preferAuthor(books, 'Başka Biri')).toEqual(books);
    expect(preferAuthor(books, undefined)).toEqual(books);
  });

  it('extracts slugs from urls and bare slugs', () => {
    expect(extractDostSlug('https://dostkitabevi.com/serenad-4')).toBe('serenad-4');
    expect(extractDostSlug('/engere%C4%9Fin-g%C3%B6z%C3%BC-2')).toBe('engereğin-gözü-2');
    expect(extractDostSlug('../x')).toBeUndefined();
    expect(extractDostSlug('%E0%A4%A')).toBeUndefined();
  });

  it('builds urls', () => {
    expect(buildDostSearchUrl('serenad livaneli')).toBe('https://dostkitabevi.com/catalog/searchtermautocomplete?term=serenad%20livaneli');
    expect(buildDostProductUrl('engereğin-gözü-2')).toBe('https://dostkitabevi.com/engere%C4%9Fin-g%C3%B6z%C3%BC-2');
  });
});
