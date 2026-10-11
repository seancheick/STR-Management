// Validate every source running balance before producing an idempotent import.
// Usage: node scripts/import-cleaner-ledger.mjs <source.txt> <output.sql>
import { readFileSync, writeFileSync } from "node:fs";
const [source, output] = process.argv.slice(2);
if (!source || !output)
  throw new Error("Provide source text and output SQL paths");
const text = readFileSync(source, "utf8");
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
let balance = 0;
const rows = [];
for (const line of text.split("\n")) {
  const match = line.match(
    /^\| (\w{3}) (\d{1,2}) \| (.*?) \| (.*?) \| (.*?) \|$/,
  );
  if (!match) continue;
  const [, month, day, description, rawAmount, rawBalance] = match;
  const number = (value) => Number(value.replace(/[^\d.-]/g, ""));
  const amount = Math.round(number(rawAmount) * 100);
  balance += amount;
  if (balance !== Math.round(number(rawBalance) * 100))
    throw new Error(`Invalid balance: ${line}`);
  const date = `2026-${String(months.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  const kind =
    amount < 0
      ? "payment"
      : /^(1st Floor|2nd Floor|Basement)/.test(description)
        ? "cleaning"
        : "adjustment";
  rows.push({ date, description, amount, kind });
}
const total = (kind) =>
  rows.filter((r) => r.kind === kind).reduce((sum, r) => sum + r.amount, 0);
if (
  rows.length !== 148 ||
  total("cleaning") !== 1234500 ||
  total("adjustment") !== 11900 ||
  total("payment") !== -1034000 ||
  balance !== 212400
)
  throw new Error(
    `Unexpected source totals: ${JSON.stringify({ count: rows.length, balance })}`,
  );
const quote = (s) => `'${s.replaceAll("'", "''")}'`;
const cleaner = "7e57f656-a7b1-45cc-83a9-958e9dc1d9d5";
const owner = "d5b29d86-8e21-444b-8524-901e2107d96b";
const values = rows
  .map(
    (r, i) =>
      `('${cleaner}','${owner}',${quote(r.date)},${i + 1},${quote(r.kind)},${quote(r.description)},${r.amount / 100},'mary-2026-source-${i + 1}')`,
  )
  .join(",\n");
writeFileSync(
  output,
  `begin;
DO $$ begin
if not exists(select 1 from public.users where id='${cleaner}' and email='marycarloston@gmail.com' and owner_id='${owner}' and role='cleaner') then raise exception 'Cleaner identity mismatch'; end if;
end $$;
insert into public.cleaner_accounts values ('${cleaner}','${owner}','Mary Carlos Team','2026-10-10','Reconciled from owner-supplied January–October 2026 ledger. Starting balance $0. No October 11 charge recorded.') on conflict(cleaner_id) do nothing;
insert into public.cleaner_ledger_entries(cleaner_id,owner_id,entry_date,sequence,kind,description,amount,source_key) values
${values}
on conflict(cleaner_id,source_key) do nothing;
DO $$ begin
if (select sum(amount) from public.cleaner_ledger_entries where cleaner_id='${cleaner}') <> 2124 or (select count(*) from public.cleaner_ledger_entries where cleaner_id='${cleaner}') <> 148 then raise exception 'Ledger verification failed'; end if;
end $$;
commit;
`,
);
console.log(
  JSON.stringify({
    entries: rows.length,
    cleanings: rows.filter((r) => r.kind === "cleaning").length,
    charges: (total("cleaning") + total("adjustment")) / 100,
    payments: -total("payment") / 100,
    balance: balance / 100,
  }),
);
