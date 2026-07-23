(function () {
  function normalizeDescription(value) {
    return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  }

  function normalizeHeader(value) {
    return String(value ?? "").replace(/^\uFEFF/, "").trim().toUpperCase().replace(/\s+/g, " ");
  }

  function headerSignature(headers) {
    return JSON.stringify(headers.map((header) => normalizeHeader(header.name ?? header)));
  }

  function parseCSV(input) {
    const text = String(input ?? "").replace(/^\uFEFF/, "");
    const records = [];
    let record = [];
    let field = "";
    let quoted = false;
    let afterQuote = false;
    let line = 1;
    let recordLine = 1;

    function finishField() {
      record.push(field);
      field = "";
      afterQuote = false;
    }
    function finishRecord() {
      finishField();
      records.push({ line: recordLine, values: record });
      record = [];
      recordLine = line;
    }

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
            afterQuote = true;
          }
        } else {
          field += char;
          if (char === "\n") line += 1;
        }
        continue;
      }
      if (afterQuote && char !== "," && char !== "\r" && char !== "\n" && !/\s/.test(char)) {
        throw new Error(`Unexpected character after a closing quote on line ${line}.`);
      }
      if (char === '"' && field === "" && !afterQuote) {
        quoted = true;
      } else if (char === ",") {
        finishField();
      } else if (char === "\n") {
        finishRecord();
        line += 1;
        recordLine = line;
      } else if (char === "\r") {
        if (text[index + 1] === "\n") index += 1;
        finishRecord();
        line += 1;
        recordLine = line;
      } else if (!afterQuote) {
        field += char;
      }
    }
    if (quoted) throw new Error(`Unclosed quoted field beginning on line ${recordLine}.`);
    if (field !== "" || record.length || afterQuote) finishRecord();
    while (records.length && records.at(-1).values.every((value) => value === "")) records.pop();
    if (!records.length) throw new Error("The CSV file is empty.");

    const headerValues = records.shift().values;
    const headers = headerValues.map((name, index) => ({
      index,
      name,
      normalized: normalizeHeader(name),
      label: String(name || "").trim() || `Unnamed column ${index + 1}`,
    }));
    const warnings = [];
    const rows = records
      .filter((entry) => {
        if (entry.values.every((value) => String(value).trim() === "")) {
          warnings.push(`Blank row ${entry.line} was skipped.`);
          return false;
        }
        return true;
      })
      .map((entry) => {
        if (entry.values.length !== headers.length) {
          warnings.push(`Row ${entry.line} has ${entry.values.length} columns; ${headers.length} were expected.`);
        }
        return {
          sourceRowNumber: entry.line,
          values: headers.map((_, index) => entry.values[index] ?? ""),
          extraValues: entry.values.slice(headers.length),
        };
      });
    return { headers, rows, warnings, signature: headerSignature(headers) };
  }

  function parseNumber(value) {
    let text = String(value ?? "").trim();
    if (!text) return null;
    let negative = false;
    if (/^\(.*\)$/.test(text)) {
      negative = true;
      text = text.slice(1, -1).trim();
    }
    text = text.replace(/[,$£€¥\s]/g, "");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return Number.NaN;
    const number = Number(text);
    return negative ? -Math.abs(number) : number;
  }

  function isoDate(year, month, day) {
    const y = Number(year), m = Number(month), d = Number(day);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function parseDate(value, format) {
    const text = String(value ?? "").trim();
    let match;
    if (format === "YYYY-MM") {
      match = text.match(/^(\d{4})-(\d{2})$/);
      return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${match[1]}-${match[2]}` : null;
    }
    if (format === "YYYY-MM-DD") {
      match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? isoDate(match[1], match[2], match[3]) : null;
    }
    const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!slash) return null;
    if (format.endsWith("YYYY") && slash[3].length !== 4) return null;
    if (format.endsWith("YY") && !format.endsWith("YYYY") && slash[3].length !== 2) return null;
    let year = Number(slash[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const dayFirst = format === "DD/MM/YYYY" || format === "DD/MM/YY";
    return isoDate(year, dayFirst ? slash[2] : slash[1], dayFirst ? slash[1] : slash[2]);
  }

  function columnIndex(mapping) {
    if (mapping === null || mapping === undefined || mapping === "") return null;
    if (typeof mapping === "object") return Number.isInteger(mapping.index) ? mapping.index : null;
    const number = Number(mapping);
    return Number.isInteger(number) ? number : null;
  }

  function valueAt(row, mapping) {
    const index = columnIndex(mapping);
    return index === null ? "" : row.values[index] ?? "";
  }

  function columnValues(parsed, mapping) {
    const index = columnIndex(mapping);
    if (index === null) return [];
    return parsed.rows.map((row) => String(row.values[index] ?? "")).filter((value) => value.trim() !== "");
  }

  function isNumericColumn(parsed, mapping) {
    const values = columnValues(parsed, mapping);
    return values.length > 0 && values.every((value) => Number.isFinite(parseNumber(value)));
  }

  function validDateFormats(parsed, mapping) {
    const values = columnValues(parsed, mapping);
    if (!values.length) return [];
    return ["YYYY-MM-DD", "MM/DD/YYYY", "MM/DD/YY", "DD/MM/YYYY", "DD/MM/YY"]
      .filter((format) => values.every((value) => Boolean(parseDate(value, format))));
  }

  const HEADER_TERMS = Object.freeze({
    date: ["TRANSACTION DATE", "POSTED DATE", "POST DATE", "DATE"],
    amount: ["TRANSACTION AMOUNT", "AMOUNT", "TOTAL"],
    debit: ["DEBIT", "WITHDRAWAL", "CHARGE"],
    credit: ["CREDIT", "DEPOSIT", "PAYMENT"],
    vendor: ["MERCHANT", "VENDOR", "PAYEE", "DESCRIPTION", "NAME"],
    category: ["CATEGORY", "BUDGET CATEGORY", "TRANSACTION CATEGORY", "CLASSIFICATION", "TYPE"],
    person: ["CARD MEMBER", "CARDMEMBER", "CARDHOLDER", "CARD HOLDER", "EMPLOYEE", "PERSON"],
    notes: ["NOTES", "NOTE", "MEMO", "DETAILS", "COMMENT"],
  });

  function headerScore(header, kind) {
    const normalized = normalizeHeader(header.name ?? header);
    const terms = HEADER_TERMS[kind] || [];
    let score = 0;
    terms.forEach((term, index) => {
      if (normalized === term) score = Math.max(score, 100 - index);
      else if (normalized.includes(term)) score = Math.max(score, 50 - index);
    });
    return score;
  }

  function suggestColumn(parsed, kind, predicate, allowFallback = true) {
    const candidates = parsed.headers
      .filter((header) => !predicate || predicate(header.index))
      .map((header) => ({ index: header.index, score: headerScore(header, kind) }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    return candidates.length && (candidates[0].score > 0 || allowFallback) ? candidates[0].index : null;
  }

  function inferAmountSignConvention(parsed, mapping) {
    const values = columnValues(parsed, mapping).map(parseNumber).filter((value) => Number.isFinite(value) && value !== 0);
    const negative = values.filter((value) => value < 0).length;
    const positive = values.filter((value) => value > 0).length;
    return { negative, positive, convention: negative >= positive ? "expensesNegative" : "expensesPositive" };
  }

  function suggestBudgetMapping(parsed) {
    const numeric = (index) => isNumericColumn(parsed, index);
    const date = suggestColumn(parsed, "date", (index) => validDateFormats(parsed, index).length > 0);
    const debit = suggestColumn(parsed, "debit", numeric);
    const credit = suggestColumn(parsed, "credit", numeric);
    const amount = suggestColumn(parsed, "amount", numeric);
    const debitCredit = debit !== null && credit !== null && debit !== credit && headerScore(parsed.headers[debit], "debit") > 0 && headerScore(parsed.headers[credit], "credit") > 0;
    const formats = validDateFormats(parsed, date);
    const dateFormat = formats.includes("MM/DD/YYYY") ? "MM/DD/YYYY"
      : formats.includes("MM/DD/YY") ? "MM/DD/YY" : formats[0] || "YYYY-MM-DD";
    const amountSign = inferAmountSignConvention(parsed, amount);
    return {
      date, dateFormat, amountMode: debitCredit ? "debitCredit" : "unified",
      amount, debit: debitCredit ? debit : null, credit: debitCredit ? credit : null,
      amountSignConvention: amountSign.convention,
      vendorDescription: suggestColumn(parsed, "vendor", null, false),
      categoryDescription: suggestColumn(parsed, "category", null, false),
      personDescription: suggestColumn(parsed, "person", null, false), notes: suggestColumn(parsed, "notes", null, false),
    };
  }

  function deriveBudgetAmount(row, type) {
    if (!type || row.amountEdited) return row.amount;
    if (row.sourceDirection === "debit") return Math.round((type === "expense" ? Math.abs(row.sourceAmount) : -Math.abs(row.sourceAmount)) * 100) / 100;
    if (row.sourceDirection === "credit") return Math.round((type === "income" ? Math.abs(row.sourceAmount) : -Math.abs(row.sourceAmount)) * 100) / 100;
    const source = Number(row.sourceAmount);
    if (!Number.isFinite(source)) return Number.NaN;
    const expensesNegative = row.amountSignConvention === "expensesNegative";
    const multiplier = type === "expense" ? (expensesNegative ? -1 : 1) : (expensesNegative ? 1 : -1);
    return Math.round(source * multiplier * 100) / 100;
  }

  function suggestBudgetType(row) {
    if (row.type === "income" || row.type === "expense") return row.type;
    if (row.sourceDirection === "debit") return "expense";
    if (row.sourceDirection === "credit") return "income";
    const source = Number(row.sourceAmount);
    if (!Number.isFinite(source) || source === 0) return "expense";
    return row.amountSignConvention === "expensesNegative"
      ? (source < 0 ? "expense" : "income")
      : (source > 0 ? "expense" : "income");
  }

  function stagingId(target, sourceRowNumber) {
    return `${target}-${sourceRowNumber}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function entityNameMatch(items, name, type = "") {
    const normalized = normalizeDescription(name);
    return items.find((item) => item.active !== false && normalizeDescription(item.name) === normalized && (!type || item.type === type)) || null;
  }

  function fillBlankMatches(rows, field, key, keyForRow, value, apply) {
    if (!key || !value) return [];
    const changed = rows.filter((row) => !row.queued && !row[field] && keyForRow(row) === key);
    changed.forEach((row) => {
      row[field] = value;
      apply?.(row);
    });
    return changed;
  }

  function createBudgetRows(parsed, profile, bundle, references, createDraftEntity) {
    const mapping = profile.columnMapping || {};
    const vendorMappings = new Map((bundle.vendorMappings || []).filter((item) => item.active !== false).map((item) => [item.normalizedSourceDescription, item.vendorId]));
    const personMappings = new Map((bundle.personMappings || []).filter((item) => item.active !== false).map((item) => [item.normalizedSourceDescription, item.assignmentId]));
    const amountSignConvention = mapping.amountSignConvention || (Number(profile.amountMultiplier) === -1 ? "expensesNegative" : "expensesPositive");
    return parsed.rows.map((source) => {
      const vendorDescription = String(valueAt(source, mapping.vendorDescription));
      const categoryDescription = String(valueAt(source, mapping.categoryDescription));
      const personDescription = String(valueAt(source, mapping.personDescription));
      const normalizedVendorDescription = normalizeDescription(vendorDescription);
      const normalizedCategoryDescription = normalizeDescription(categoryDescription);
      const normalizedPersonDescription = normalizeDescription(personDescription);
      let sourceAmount, sourceDirection = "unified", amountLayoutError = "";
      if (profile.amountMode === "debitCredit") {
        const debit = parseNumber(valueAt(source, mapping.debit));
        const credit = parseNumber(valueAt(source, mapping.credit));
        const hasDebit = debit !== null && debit !== 0;
        const hasCredit = credit !== null && credit !== 0;
        if (Number.isNaN(debit) || Number.isNaN(credit)) amountLayoutError = "Debit and credit values must be numeric.";
        else if (hasDebit === hasCredit) amountLayoutError = hasDebit ? "A row cannot contain both debit and credit amounts." : "Enter either a debit or credit amount.";
        if (hasDebit && !hasCredit) { sourceAmount = debit; sourceDirection = "debit"; }
        else if (hasCredit && !hasDebit) { sourceAmount = credit; sourceDirection = "credit"; }
        else sourceAmount = Number.NaN;
      } else sourceAmount = parseNumber(valueAt(source, mapping.amount));
      const amount = Number.isFinite(sourceAmount) ? Math.round(sourceAmount * 100) / 100 : sourceAmount;
      const base = {
        stagingId: stagingId("budget", source.sourceRowNumber), sourceRowNumber: source.sourceRowNumber,
        include: true, queued: false, originalValues: source.values.slice(),
        date: parseDate(valueAt(source, mapping.date), profile.dateFormat), amount,
        sourceAmount, sourceDirection, amountSignConvention, amountEdited: false, amountLayoutError,
        vendorDescription, normalizedVendorDescription,
        categoryDescription, normalizedCategoryDescription,
        personDescription, normalizedPersonDescription,
        vendorId: vendorMappings.get(normalizedVendorDescription) || "",
        vendorResolution: vendorMappings.has(normalizedVendorDescription) ? "saved" : "unresolved",
        personId: normalizedPersonDescription ? personMappings.get(normalizedPersonDescription) || "" : references.sharedAssignmentId,
        personResolution: normalizedPersonDescription ? (personMappings.has(normalizedPersonDescription) ? "saved" : "unresolved") : "default",
        categoryId: "", type: "", notes: String(valueAt(source, mapping.notes)), warnings: [], errors: [],
      };
      const inferredType = suggestBudgetType(base);
      if (mapping.autoPopulateCategory && normalizedCategoryDescription) {
        const categoryMatches = references.categories.filter((item) => item.active !== false && normalizeDescription(item.name) === normalizedCategoryDescription);
        const category = categoryMatches.find((item) => item.type === inferredType)
          || (categoryMatches.length === 1 ? categoryMatches[0] : null)
          || createDraftEntity?.("category", categoryDescription, inferredType);
        if (category) { base.categoryId = category.id; base.type = category.type; }
      }
      const effectiveType = base.type || inferredType;
      if (!base.vendorId && mapping.autoPopulateVendor && normalizedVendorDescription && effectiveType === "expense") {
        const vendor = entityNameMatch(references.vendors, vendorDescription)
          || createDraftEntity?.("vendor", vendorDescription);
        if (vendor) { base.vendorId = vendor.id; base.vendorResolution = "pending"; }
      }
      if (!base.personId && mapping.autoPopulatePerson && normalizedPersonDescription) {
        const person = entityNameMatch(references.people, personDescription)
          || createDraftEntity?.("assignment", personDescription);
        if (person) { base.personId = person.id; base.personResolution = "pending"; }
      }
      return base;
    });
  }

  function validateBudgetRow(row, references, profile) {
    const errors = [];
    const warnings = [];
    const category = references.categories.find((item) => item.id === row.categoryId && item.active !== false);
    const assignment = references.people.find((item) => item.id === row.personId && item.active !== false);
    const vendor = references.vendors.find((item) => item.id === row.vendorId && item.active !== false);
    const type = category?.type || "";
    const amount = deriveBudgetAmount(row, type);
    if (!profile?.id) errors.push("Choose and save an import profile.");
    if (!row.date) errors.push("Enter a valid date.");
    if (!Number.isFinite(Number(amount)) || Number(amount) === 0) errors.push("Enter a non-zero amount.");
    if (row.amountLayoutError) errors.push(row.amountLayoutError);
    if (!category) errors.push("Choose a category.");
    if (!assignment) errors.push("Choose an assignment.");
    if (category?.type === "expense" && !vendor) errors.push("Choose a vendor for this expense.");
    if (!row.personDescription) warnings.push("Shared assignment applied because no source person was available.");
    return { errors, warnings, type, amount };
  }

  function createInvestmentRows(parsed, profile, existingMonths) {
    const mapping = profile.columnMapping || {};
    const contributionColumns = Array.isArray(mapping.contributions) ? mapping.contributions : [];
    const seen = new Map();
    const rows = parsed.rows.map((source) => {
      const parsedDate = parseDate(valueAt(source, mapping.month), profile.dateFormat);
      const month = parsedDate && parsedDate.length === 10 ? parsedDate.slice(0, 7) : parsedDate;
      const contributions = contributionColumns.map((column) => parseNumber(valueAt(source, column)));
      const existing = existingMonths.find((item) => item.accountId === profile.investmentAccountId && item.month === month) || null;
      const row = {
        stagingId: stagingId("investment", source.sourceRowNumber), sourceRowNumber: source.sourceRowNumber,
        include: true, queued: false, originalValues: source.values.slice(), accountId: profile.investmentAccountId,
        month, balance: parseNumber(valueAt(source, mapping.balance)), contributions,
        notes: String(valueAt(source, mapping.notes)), existing, warnings: existing ? ["This month already exists and will be replaced."] : [], errors: [],
      };
      if (month) seen.set(month, [...(seen.get(month) || []), row]);
      return row;
    });
    seen.forEach((matches) => {
      if (matches.length > 1) matches.forEach((row) => row.errors.push("This account-month appears more than once in the CSV."));
    });
    return rows;
  }

  function validateInvestmentRow(row, references, profile) {
    const errors = row.errors.filter((error) => error.includes("more than once"));
    const warnings = row.existing ? ["This month already exists and will be replaced."] : [];
    if (!profile?.id) errors.push("Choose and save an import profile.");
    if (!references.accounts.some((item) => item.id === row.accountId && item.active !== false)) errors.push("Choose an active investment account.");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month || "")) errors.push("Enter a valid reporting month.");
    if (!Number.isFinite(Number(row.balance)) || Number(row.balance) < 0) errors.push("Enter a nonnegative ending balance.");
    if (row.contributions.some((amount) => amount !== null && !Number.isFinite(Number(amount)))) errors.push("Contribution values must be numeric.");
    return { errors, warnings };
  }

  window.ImportUtils = {
    DATE_FORMATS: ["YYYY-MM-DD", "MM/DD/YYYY", "MM/DD/YY", "DD/MM/YYYY", "DD/MM/YY", "YYYY-MM"],
    normalizeDescription, normalizeHeader, headerSignature, parseCSV, parseNumber, parseDate,
    columnIndex, valueAt, columnValues, isNumericColumn, validDateFormats, headerScore, suggestColumn,
    inferAmountSignConvention, suggestBudgetMapping, deriveBudgetAmount, suggestBudgetType,
    entityNameMatch, fillBlankMatches, createBudgetRows, validateBudgetRow, createInvestmentRows, validateInvestmentRow,
  };
})();
