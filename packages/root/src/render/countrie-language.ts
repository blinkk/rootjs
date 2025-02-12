// This data file was taken from the country-language package on npm.
// The project seems to no longer be supported, so we replicate its
// functionality here.
import DATA from './data/country-language.json';

interface CountryLanguages {
  code: string;
  name: string;
  languages: Language[];
  langCultureMs?: Array<{langCultureName: string}>;
}

interface Language {
  iso639_1: string;
}

export function getCountryLanguageData(
  countryCode: string
): CountryLanguages | null {
  const countryCodeUpper = countryCode.toUpperCase();
  for (const country of DATA.countries) {
    if (country.code_2 === countryCodeUpper) {
      const langCodes = country.languages || [];
      const languages: Language[] = [];
      langCodes.forEach((langCode: string) => {
        const langData = getLanguageData(langCode);
        if (langData) {
          languages.push(langData);
        }
      });
      return {
        code: country.code_2,
        name: country.name,
        languages: languages,
        langCultureMs: country.langCultureMs,
      };
    }
  }
  return null;
}

function getLanguageData(dataLangCode: string): Language | null {
  for (const lang of DATA.languages) {
    if (lang.iso639_2 === dataLangCode) {
      return {
        iso639_1: lang.iso639_1,
      };
    }
  }
  return null;
}
