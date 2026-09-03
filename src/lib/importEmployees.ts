import Papa from 'papaparse';
import { downloadBlob, readFileAsArrayBuffer, readFileAsText } from './file';

const NAME_HEADERS = ['氏名', '名前', '名称', 'name', '従業員', '担当者', 'お名前'];

/** 2 次元配列から氏名の一覧を取り出す。1 列目を氏名とみなし、ヘッダー行は自動で除く */
export function rowsToNames(rows: string[][]): string[] {
  const names = rows.map((r) => (r[0] ?? '').toString().trim()).filter((n) => n !== '');
  if (names.length === 0) return [];
  const first = names[0].toLowerCase();
  const hasHeader = NAME_HEADERS.some((h) => first === h.toLowerCase());
  const body = hasHeader ? names.slice(1) : names;
  return body.filter((n) => !n.startsWith('(記入例)'));
}

export async function parseEmployeeFile(file: File): Promise<string[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const XLSX = await import('xlsx');
    const buf = await readFileAsArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
    return rowsToNames(rows);
  }
  const text = await readFileAsText(file);
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true });
  return rowsToNames(parsed.data);
}

/** 従業員登録フォーマット (Excel、氏名の 1 列) をダウンロードさせる */
export async function downloadEmployeeTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = [['氏名'], ['森 花子'], ['佐々木 純'], ['(記入例) 2 行目から 1 行に 1 人ずつ氏名を書く。この行は消してよい']];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '従業員');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '従業員登録フォーマット.xlsx');
}
