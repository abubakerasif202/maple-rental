param(
    [string]$InvoicePath = "C:\Users\abuba\Invoice-list.xls",
    [string]$ClientPath = "C:\Users\abuba\RentalClientList.xlsx",
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path $Path)) {
        return $null
    }

    foreach ($line in Get-Content $Path) {
        if ($line -match "^\s*$Key=(.*)$") {
            return $Matches[1].Trim().Trim('"')
        }
    }

    return $null
}

function Get-ExcelApplication {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    return $excel
}

function Normalize-Name {
    param([string]$Value)

    if (-not $Value) {
        return $null
    }

    $normalized = ($Value -replace '\s+', ' ').Trim().ToLowerInvariant()
    if (-not $normalized) {
        return $null
    }

    return $normalized
}

function Normalize-Phone {
    param([string]$Value)

    if (-not $Value) {
        return $null
    }

    $digits = ($Value -replace '[^0-9]', '')
    if (-not $digits) {
        return $null
    }

    return $digits
}

function Parse-AustralianDate {
    param([string]$Value)

    if (-not $Value) {
        return $null
    }

    try {
        return [DateTime]::ParseExact(
            $Value,
            'dd/MM/yyyy',
            [System.Globalization.CultureInfo]::InvariantCulture
        ).ToString('yyyy-MM-dd')
    }
    catch {
        return $null
    }
}

function Parse-InvoiceDate {
    param([string]$Value)

    if (-not $Value) {
        return $null
    }

    return [DateTime]::ParseExact(
        $Value,
        'dd MMM yy',
        [System.Globalization.CultureInfo]::InvariantCulture
    )
}

function Parse-InvoiceAmounts {
    param([string]$Value)

    $matches = [regex]::Matches($Value, '\$?([0-9]+(?:\.[0-9]+)?)')
    if ($matches.Count -eq 0) {
        return [pscustomobject]@{
            Amount = $null
            Balance = $null
        }
    }

    $amount = [decimal]::Parse($matches[0].Groups[1].Value, [System.Globalization.CultureInfo]::InvariantCulture)
    $balance = if ($matches.Count -ge 2) {
        [decimal]::Parse($matches[1].Groups[1].Value, [System.Globalization.CultureInfo]::InvariantCulture)
    }
    else {
        $amount
    }

    return [pscustomobject]@{
        Amount = $amount
        Balance = $balance
    }
}

function Read-ClientRows {
    param([string]$Path)

    $excel = Get-ExcelApplication
    $workbook = $null
    $sheet = $null
    $used = $null

    try {
        $workbook = $excel.Workbooks.Open($Path)
        $sheet = $workbook.Worksheets.Item(1)
        $used = $sheet.UsedRange
        $rows = @()

        for ($rowIndex = 2; $rowIndex -le $used.Rows.Count; $rowIndex++) {
            $rows += [pscustomobject]@{
                ExternalId = [string]$sheet.Cells.Item($rowIndex, 1).Text
                StaffNum = [string]$sheet.Cells.Item($rowIndex, 2).Text
                PreferredName = [string]$sheet.Cells.Item($rowIndex, 3).Text
                CompanyName = [string]$sheet.Cells.Item($rowIndex, 4).Text
                Phone = [string]$sheet.Cells.Item($rowIndex, 7).Text
                Email = [string]$sheet.Cells.Item($rowIndex, 8).Text
                DateOfBirth = Parse-AustralianDate ([string]$sheet.Cells.Item($rowIndex, 9).Text)
                Street = [string]$sheet.Cells.Item($rowIndex, 10).Text
                City = [string]$sheet.Cells.Item($rowIndex, 11).Text
                PostCode = [string]$sheet.Cells.Item($rowIndex, 12).Text
                State = [string]$sheet.Cells.Item($rowIndex, 13).Text
            }
        }

        return $rows
    }
    finally {
        if ($workbook) {
            $workbook.Close($false)
        }

        $excel.Quit()

        if ($used) {
            [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($used)
        }

        if ($sheet) {
            [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($sheet)
        }

        if ($workbook) {
            [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook)
        }

        [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel)
        [gc]::Collect()
        [gc]::WaitForPendingFinalizers()
    }
}

function Read-InvoiceRows {
    param([string]$Path)

    $excel = Get-ExcelApplication
    $workbook = $null
    $sheet = $null
    $used = $null

    try {
        $workbook = $excel.Workbooks.Open($Path)
        $sheet = $workbook.Worksheets.Item(1)
        $used = $sheet.UsedRange
        $rows = @()

        for ($rowIndex = 2; $rowIndex -le $used.Rows.Count; $rowIndex++) {
            $invoiceNumber = [string]$sheet.Cells.Item($rowIndex, 1).Text
            if (-not $invoiceNumber) {
                continue
            }

            $amounts = Parse-InvoiceAmounts ([string]$sheet.Cells.Item($rowIndex, 6).Text)
            $rows += [pscustomobject]@{
                ExternalInvoiceNumber = $invoiceNumber.Trim()
                Client = ([string]$sheet.Cells.Item($rowIndex, 2).Text -replace '\s+', ' ').Trim()
                Reference = ([string]$sheet.Cells.Item($rowIndex, 3).Text).Trim().ToUpperInvariant()
                InvoiceDate = Parse-InvoiceDate ([string]$sheet.Cells.Item($rowIndex, 4).Text)
                DueLabel = [string]$sheet.Cells.Item($rowIndex, 5).Text
                Amount = $amounts.Amount
                Balance = $amounts.Balance
                TransactionSummary = [string]$sheet.Cells.Item($rowIndex, 7).Text
            }
        }

        return $rows
    }
    finally {
        if ($workbook) {
            $workbook.Close($false)
        }

        $excel.Quit()

        if ($used) {
            [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($used)
        }

        if ($sheet) {
            [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($sheet)
        }

        if ($workbook) {
            [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook)
        }

        [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel)
        [gc]::Collect()
        [gc]::WaitForPendingFinalizers()
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot '.env'

if (-not (Test-Path $envPath)) {
    throw 'A .env file is required so the importer can connect to Supabase.'
}

$supabaseUrl = Get-DotEnvValue -Path $envPath -Key 'SUPABASE_URL'
$supabaseKey = Get-DotEnvValue -Path $envPath -Key 'SUPABASE_SERVICE_ROLE_KEY'

if (-not $supabaseUrl -or -not $supabaseKey) {
    throw 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be present in .env to import operational history.'
}

if (-not (Test-Path $InvoicePath)) {
    throw "Invoice workbook not found: $InvoicePath"
}

if (-not (Test-Path $ClientPath)) {
    throw "Client workbook not found: $ClientPath"
}

$clientRows = Read-ClientRows -Path $ClientPath
$invoiceRows = Read-InvoiceRows -Path $InvoicePath

$customerImports = @()
$customerKeyByNormalizedName = @{}

foreach ($clientRow in $clientRows) {
    $preferredName = ($clientRow.PreferredName -replace '\s+', ' ').Trim()
    $companyName = ($clientRow.CompanyName -replace '\s+', ' ').Trim()
    $fullName = if ($preferredName) { $preferredName } elseif ($companyName) { $companyName } elseif ($clientRow.Email) { $clientRow.Email.Trim().ToLowerInvariant() } elseif ($clientRow.ExternalId) { "Legacy customer $($clientRow.ExternalId)" } else { $null }

    if (-not $fullName) {
        continue
    }

    $customerImports += [ordered]@{
        external_id = if ($clientRow.ExternalId) { $clientRow.ExternalId.Trim() } else { $null }
        staff_number = if ($clientRow.StaffNum) { $clientRow.StaffNum.Trim() } else { $null }
        full_name = $fullName
        preferred_name = if ($preferredName) { $preferredName } else { $null }
        company_name = if ($companyName) { $companyName } else { $null }
        phone = Normalize-Phone -Value $clientRow.Phone
        email = if ($clientRow.Email) { $clientRow.Email.Trim().ToLowerInvariant() } else { $null }
        date_of_birth = $clientRow.DateOfBirth
        street = if ($clientRow.Street) { $clientRow.Street.Trim() } else { $null }
        city = if ($clientRow.City) { $clientRow.City.Trim() } else { $null }
        postcode = if ($clientRow.PostCode) { $clientRow.PostCode.Trim() } else { $null }
        state = if ($clientRow.State) { $clientRow.State.Trim() } else { $null }
        source = 'legacy-import'
        _lookup_name = Normalize-Name $(if ($preferredName) { $preferredName } else { $companyName })
    }

    $lookupName = $customerImports[-1]._lookup_name
    if ($lookupName -and -not $customerKeyByNormalizedName.ContainsKey($lookupName)) {
        $customerKeyByNormalizedName[$lookupName] = $customerImports[-1]
    }
}

$invoiceImports = @()

foreach ($invoiceRow in $invoiceRows) {
    if (-not $invoiceRow.InvoiceDate -or -not $invoiceRow.Amount) {
        continue
    }

    $invoiceCustomerName = if ($invoiceRow.Client) { $invoiceRow.Client } else { 'Unknown legacy customer' }
    $lookupName = Normalize-Name $invoiceCustomerName
    $matchedCustomer = if ($lookupName -and $customerKeyByNormalizedName.ContainsKey($lookupName)) { $customerKeyByNormalizedName[$lookupName] } else { $null }

    $invoiceImports += [ordered]@{
        external_invoice_number = $invoiceRow.ExternalInvoiceNumber
        customer_name = $invoiceCustomerName
        car_registration = if ($invoiceRow.Reference) { $invoiceRow.Reference } else { $null }
        invoice_date = $invoiceRow.InvoiceDate.ToString('yyyy-MM-dd')
        due_label = if ($invoiceRow.DueLabel) { $invoiceRow.DueLabel.Trim() } else { $null }
        amount = [decimal]::Round($invoiceRow.Amount, 2)
        balance = [decimal]::Round($(if ($invoiceRow.Balance) { $invoiceRow.Balance } else { $invoiceRow.Amount }), 2)
        transaction_summary = if ($invoiceRow.TransactionSummary) { $invoiceRow.TransactionSummary.Trim() } else { $null }
        source = 'legacy-import'
        customer_external_id = if ($matchedCustomer) { $matchedCustomer.external_id } else { $null }
        customer_staff_number = if ($matchedCustomer) { $matchedCustomer.staff_number } else { $null }
        customer_email = if ($matchedCustomer) { $matchedCustomer.email } else { $null }
    }
}

$summary = [ordered]@{
    clientRows = $clientRows.Count
    invoiceRows = $invoiceRows.Count
    importedCustomers = $customerImports.Count
    importedInvoices = $invoiceImports.Count
    matchedInvoices = @($invoiceImports | Where-Object { $_.customer_external_id -or $_.customer_staff_number -or $_.customer_email }).Count
    unmatchedInvoices = @($invoiceImports | Where-Object { -not ($_.customer_external_id -or $_.customer_staff_number -or $_.customer_email) }).Count
    sampleCustomers = @($customerImports | Select-Object -First 5)
    sampleInvoices = @($invoiceImports | Select-Object -First 5)
}

if (-not $Apply) {
    $summary | ConvertTo-Json -Depth 8
    exit 0
}

$payload = [ordered]@{
    customers = @($customerImports | ForEach-Object {
        [ordered]@{
            external_id = $_.external_id
            staff_number = $_.staff_number
            full_name = $_.full_name
            preferred_name = $_.preferred_name
            company_name = $_.company_name
            phone = $_.phone
            email = $_.email
            date_of_birth = $_.date_of_birth
            street = $_.street
            city = $_.city
            postcode = $_.postcode
            state = $_.state
            source = $_.source
        }
    })
    invoices = @($invoiceImports)
}

$tempId = [guid]::NewGuid().ToString('N')
$tempPayloadPath = Join-Path $repoRoot ".operational-import-$tempId.json"
$tempScriptPath = Join-Path $repoRoot ".operational-import-$tempId.mjs"
$tempStdoutPath = Join-Path $repoRoot ".operational-import-$tempId.stdout.log"
$tempStderrPath = Join-Path $repoRoot ".operational-import-$tempId.stderr.log"

try {
    $payload | ConvertTo-Json -Depth 8 | Set-Content -Path $tempPayloadPath -Encoding UTF8

    $nodeScript = @'
import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const [, , payloadPath, envPath] = process.argv;

dotenv.config({ path: envPath, quiet: true });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!payloadPath || !envPath) {
  throw new Error('Expected payload path and env path arguments.');
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the provided .env file.');
}

const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8').replace(/^\uFEFF/, ''));
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const isMissingTableError = (error) => {
  const message = error?.message || '';
  return error?.code === 'PGRST205' || /could not find the table/i.test(message);
};

async function tableExists(table) {
  const { error } = await supabase.from(table).select('*').limit(1);
  if (!error) return true;
  if (isMissingTableError(error)) return false;
  throw error;
}

async function deleteAll(table) {
  const { error } = await supabase.from(table).delete().gte('id', 0);
  if (error) throw error;
}

async function insertInChunks(table, rows, selectFields) {
  const chunkSize = 100;
  const inserted = [];

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    if (chunk.length === 0) continue;

    const { data, error } = await supabase.from(table).insert(chunk).select(selectFields);
    if (error) throw error;
    inserted.push(...(data ?? []));
  }

  return inserted;
}

const customersTableExists = await tableExists('customers');
const invoicesTableExists = await tableExists('invoices');

if (!customersTableExists || !invoicesTableExists) {
  console.log(JSON.stringify({
    operationalSchemaAvailable: false,
    importedCustomers: 0,
    importedInvoices: 0,
  }, null, 2));
  process.exit(0);
}

await deleteAll('invoices');
await deleteAll('customers');

const insertedCustomers = await insertInChunks('customers', payload.customers, 'id, external_id, staff_number, email');

const customerIdByExternalId = new Map(
  insertedCustomers
    .filter((customer) => customer.external_id)
    .map((customer) => [customer.external_id, customer.id]),
);

const customerIdByStaffNumber = new Map(
  insertedCustomers
    .filter((customer) => customer.staff_number)
    .map((customer) => [customer.staff_number, customer.id]),
);

const customerIdByEmail = new Map(
  insertedCustomers
    .filter((customer) => customer.email)
    .map((customer) => [customer.email, customer.id]),
);

const invoicesToInsert = payload.invoices.map((invoice) => ({
  external_invoice_number: invoice.external_invoice_number,
  customer_id:
    customerIdByExternalId.get(invoice.customer_external_id) ??
    customerIdByStaffNumber.get(invoice.customer_staff_number) ??
    customerIdByEmail.get(invoice.customer_email) ??
    null,
  customer_name: invoice.customer_name,
  car_registration: invoice.car_registration,
  invoice_date: invoice.invoice_date,
  due_label: invoice.due_label,
  amount: invoice.amount,
  balance: invoice.balance,
  transaction_summary: invoice.transaction_summary,
  source: invoice.source,
}));

await insertInChunks('invoices', invoicesToInsert, 'id');

const [{ count: customerCount }, { count: invoiceCount }] = await Promise.all([
  supabase.from('customers').select('id', { count: 'exact', head: true }),
  supabase.from('invoices').select('id', { count: 'exact', head: true }),
]);

console.log(JSON.stringify({
  operationalSchemaAvailable: true,
  importedCustomers: customerCount ?? 0,
  importedInvoices: invoiceCount ?? 0,
}, null, 2));
'@

    Set-Content -Path $tempScriptPath -Value $nodeScript -Encoding UTF8
    $nodeProcess = Start-Process `
        -FilePath 'node' `
        -ArgumentList @($tempScriptPath, $tempPayloadPath, $envPath) `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $tempStdoutPath `
        -RedirectStandardError $tempStderrPath
    $nodeExitCode = $nodeProcess.ExitCode
    $stdoutContent = if (Test-Path $tempStdoutPath) { Get-Content $tempStdoutPath -Raw } else { '' }
    $stderrContent = if (Test-Path $tempStderrPath) { Get-Content $tempStderrPath -Raw } else { '' }
    if ($nodeExitCode -ne 0) {
        throw (($stderrContent + [Environment]::NewLine + $stdoutContent).Trim())
    }

    $summary | Add-Member -NotePropertyName applyResult -NotePropertyValue ($stdoutContent.Trim()) -Force
    $summary | ConvertTo-Json -Depth 8
}
finally {
    if (Test-Path $tempPayloadPath) {
        Remove-Item $tempPayloadPath -Force
    }

    if (Test-Path $tempScriptPath) {
        Remove-Item $tempScriptPath -Force
    }

    if (Test-Path $tempStdoutPath) {
        Remove-Item $tempStdoutPath -Force
    }

    if (Test-Path $tempStderrPath) {
        Remove-Item $tempStderrPath -Force
    }
}
