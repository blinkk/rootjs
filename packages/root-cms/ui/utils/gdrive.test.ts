import {describe, it, expect} from 'vitest';
import {parseGoogleDriveId} from './gdrive.js';

describe('parseGoogleDriveId', () => {
  it('extracts ID from drive.google.com open URL', () => {
    expect(parseGoogleDriveId('https://drive.google.com/open?id=12345')).toBe(
      '12345'
    );
  });

  it('extracts ID from drive.google.com file URL', () => {
    expect(
      parseGoogleDriveId('https://drive.google.com/file/d/12345/view')
    ).toBe('12345');
    expect(
      parseGoogleDriveId('https://drive.google.com/file/u/1/d/12345/view')
    ).toBe('12345');
  });

  it('extracts ID from docs.google.com document URL', () => {
    expect(
      parseGoogleDriveId('https://docs.google.com/document/d/12345/edit')
    ).toBe('12345');
  });

  it('extracts ID from docs.google.com spreadsheet URL', () => {
    expect(
      parseGoogleDriveId('https://docs.google.com/spreadsheets/d/12345/edit')
    ).toBe('12345');
  });

  it('returns null for other google domains', () => {
    expect(parseGoogleDriveId('https://www.google.com')).toBe(null);
    expect(parseGoogleDriveId('https://mail.google.com')).toBe(null);
  });

  it('returns null for non-google URLs', () => {
    expect(parseGoogleDriveId('https://example.com')).toBe(null);
    expect(parseGoogleDriveId('invalid-url')).toBe(null);
  });

  it('returns null when ID is missing', () => {
    expect(parseGoogleDriveId('https://drive.google.com/foo')).toBe(null);
  });
});
