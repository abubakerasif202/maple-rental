param(
    [string]$FleetPath = "C:\Users\abuba\Fleets.xlsx",
    [string]$InvoicePath = "C:\Users\abuba\Invoice-list.xls",
    [string]$ClientPath = "C:\Users\abuba\RentalClientList.xlsx",
    [int]$RecentInvoiceWindowDays = 21,
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
        return '0000000000'
    }

    $digits = ($Value -replace '[^0-9]', '')
    if ($digits.Length -lt 10) {
        return '0000000000'
    }

    return $digits
}

function Get-LegacyEmail {
    param(
        [string]$Registration,
        [string]$ExistingEmail
    )

    if ($ExistingEmail) {
        return $ExistingEmail.Trim().ToLowerInvariant()
    }

    $safeRegistration = ($Registration -replace '[^A-Za-z0-9]', '').ToLowerInvariant()
    return "legacy-$safeRegistration@example.invalid"
}

function Get-AddressText {
    param($Client)

    if (-not $Client) {
        return 'Address not provided in legacy import'
    }

    $parts = @(
        [string]$Client.Street,
        [string]$Client.City,
        [string]$Client.State,
        [string]$Client.PostCode
    ) | Where-Object { $_ -and $_.Trim() }

    if ($parts.Count -eq 0) {
        return 'Address not provided in legacy import'
    }

    return ($parts -join ', ')
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

function Parse-InvoiceAmount {
    param([string]$Value)

    if (-not $Value) {
        return $null
    }

    $match = [regex]::Match($Value, '\$?([0-9]+(?:\.[0-9]+)?)')
    if (-not $match.Success) {
        return $null
    }

    return [decimal]::Parse(
        $match.Groups[1].Value,
        [System.Globalization.CultureInfo]::InvariantCulture
    )
}

function Read-FleetRows {
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
            $registration = [string]$sheet.Cells.Item($rowIndex, 2).Text
            if (-not $registration) {
                continue
            }

            $rows += [pscustomobject]@{
                ExternalId = [string]$sheet.Cells.Item($rowIndex, 1).Text
                Registration = $registration.Trim().ToUpperInvariant()
                Company = [string]$sheet.Cells.Item($rowIndex, 3).Text
                Managing = [string]$sheet.Cells.Item($rowIndex, 4).Text
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
            $reference = [string]$sheet.Cells.Item($rowIndex, 3).Text
            if (-not $reference) {
                continue
            }

            $rows += [pscustomobject]@{
                Client = [string]$sheet.Cells.Item($rowIndex, 2).Text
                Reference = $reference.Trim().ToUpperInvariant()
                Date = Parse-InvoiceDate ([string]$sheet.Cells.Item($rowIndex, 4).Text)
                Amount = Parse-InvoiceAmount ([string]$sheet.Cells.Item($rowIndex, 6).Text)
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
    throw 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be present in .env to import workbook data.'
}

if (-not (Test-Path $FleetPath)) {
    throw "Fleet workbook not found: $FleetPath"
}

if (-not (Test-Path $InvoicePath)) {
    throw "Invoice workbook not found: $InvoicePath"
}

if (-not (Test-Path $ClientPath)) {
    throw "Client workbook not found: $ClientPath"
}

$fleetRows = Read-FleetRows -Path $FleetPath
$invoiceRows = Read-InvoiceRows -Path $InvoicePath
$clientRows = Read-ClientRows -Path $ClientPath

if (-not $fleetRows.Count) {
    throw 'No fleet rows were found in the fleet workbook.'
}

$fleetRegistrations = @{}
foreach ($fleetRow in $fleetRows) {
    $fleetRegistrations[$fleetRow.Registration] = $true
}

$clientByName = @{}
foreach ($clientRow in $clientRows) {
    $nameKey = Normalize-Name $clientRow.PreferredName
    if (-not $nameKey) {
        $nameKey = Normalize-Name $clientRow.CompanyName
    }

    if ($nameKey -and -not $clientByName.ContainsKey($nameKey)) {
        $clientByName[$nameKey] = $clientRow
    }
}

$latestByReference = @{}
$earliestByReferenceAndClient = @{}
$latestInvoiceDate = $invoiceRows | Where-Object { $_.Date } | Measure-Object -Maximum Date | Select-Object -ExpandProperty Maximum

foreach ($invoiceRow in $invoiceRows) {
    if (-not $fleetRegistrations.ContainsKey($invoiceRow.Reference)) {
        continue
    }

    if (-not $invoiceRow.Date) {
        continue
    }

    if (-not $latestByReference.ContainsKey($invoiceRow.Reference) -or $invoiceRow.Date -gt $latestByReference[$invoiceRow.Reference].Date) {
        $latestByReference[$invoiceRow.Reference] = $invoiceRow
    }

    $clientKey = Normalize-Name $invoiceRow.Client
    if ($clientKey) {
        $compoundKey = "$($invoiceRow.Reference)|$clientKey"
        if (-not $earliestByReferenceAndClient.ContainsKey($compoundKey) -or $invoiceRow.Date -lt $earliestByReferenceAndClient[$compoundKey]) {
            $earliestByReferenceAndClient[$compoundKey] = $invoiceRow.Date
        }
    }
}

$defaultImages = @(
    'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1657872737697-737a2d123ef2?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1624578571415-09e9b1991929?q=80&w=1600&auto=format&fit=crop'
)

$carImports = @()
$carImportByRegistration = @{}
$applicationImportByEmail = @{}
$rentalImports = @()
$importDateLabel = (Get-Date).ToString('yyyy-MM-dd')

for ($index = 0; $index -lt $fleetRows.Count; $index++) {
    $fleetRow = $fleetRows[$index]
    $latestInvoice = $latestByReference[$fleetRow.Registration]
    $weeklyPrice = if ($latestInvoice -and $latestInvoice.Amount) { [decimal]::Round($latestInvoice.Amount, 2) } else { [decimal]350 }
    $status = if ($latestInvoice -and $latestInvoiceDate -and (($latestInvoiceDate - $latestInvoice.Date).Days -le $RecentInvoiceWindowDays)) { 'Rented' } else { 'Available' }

    $carImport = [ordered]@{
        registration = $fleetRow.Registration
        name = "Maple Fleet Vehicle ($($fleetRow.Registration))"
        model_year = 2024
        weekly_price = $weeklyPrice
        bond = 500
        status = $status
        image = $defaultImages[$index % $defaultImages.Count]
    }

    $carImports += $carImport
    $carImportByRegistration[$fleetRow.Registration] = $carImport
}

foreach ($registration in ($latestByReference.Keys | Sort-Object)) {
    $latestInvoice = $latestByReference[$registration]
    if (-not $latestInvoiceDate -or (($latestInvoiceDate - $latestInvoice.Date).Days -gt $RecentInvoiceWindowDays)) {
        continue
    }

    $clientKey = Normalize-Name $latestInvoice.Client
    $matchedClient = if ($clientKey -and $clientByName.ContainsKey($clientKey)) { $clientByName[$clientKey] } else { $null }
    $displayName = if ($matchedClient -and $matchedClient.PreferredName) { ($matchedClient.PreferredName -replace '\s+', ' ').Trim() } else { ($latestInvoice.Client -replace '\s+', ' ').Trim() }
    $email = Get-LegacyEmail -Registration $registration -ExistingEmail $matchedClient.Email
    $phone = Normalize-Phone -Value $matchedClient.Phone
    $address = Get-AddressText -Client $matchedClient
    $legacyId = if ($matchedClient -and $matchedClient.StaffNum) { $matchedClient.StaffNum } elseif ($matchedClient -and $matchedClient.ExternalId) { $matchedClient.ExternalId } else { $registration }
    $compoundKey = if ($clientKey) { "$registration|$clientKey" } else { $null }
    $startDate = if ($compoundKey -and $earliestByReferenceAndClient.ContainsKey($compoundKey)) { $earliestByReferenceAndClient[$compoundKey].ToString('yyyy-MM-dd') } else { $latestInvoice.Date.ToString('yyyy-MM-dd') }

    if (-not $applicationImportByEmail.ContainsKey($email)) {
        $applicationImportByEmail[$email] = [ordered]@{
            email = $email
            name = if ($displayName) { $displayName } else { "Legacy renter $registration" }
            phone = $phone
            license_number = "LEGACY-$legacyId"
            license_expiry = '2099-12-31'
            uber_status = 'Not Yet Registered'
            experience = if ($matchedClient) {
                "Legacy renter import created from workbook data on $importDateLabel."
            } else {
                "Legacy renter import created from workbook data on $importDateLabel. Contact details were not present in RentalClientList.xlsx."
            }
            address = $address
            weekly_budget = ('$' + $latestInvoice.Amount)
            intended_start_date = $startDate
            status = 'Approved'
            source_registration = $registration
        }
    }

    $rentalImports += [ordered]@{
        registration = $registration
        application_email = $email
        start_date = $startDate
        weekly_price = [decimal]::Round($latestInvoice.Amount, 2)
        status = 'Active'
        matched_client = [bool]$matchedClient
    }
}

$applicationImports = @($applicationImportByEmail.Values)

$summary = [ordered]@{
    fleetRows = $fleetRows.Count
    invoiceRows = $invoiceRows.Count
    clientRows = $clientRows.Count
    latestInvoiceDate = if ($latestInvoiceDate) { $latestInvoiceDate.ToString('yyyy-MM-dd') } else { $null }
    importedCars = $carImports.Count
    rentedCars = ($carImports | Where-Object { $_.status -eq 'Rented' }).Count
    availableCars = ($carImports | Where-Object { $_.status -eq 'Available' }).Count
    importedApplications = $applicationImports.Count
    importedRentals = $rentalImports.Count
    rentalsWithMatchedClient = @($rentalImports | Where-Object { $_.matched_client -eq $true }).Count
    rentalsUsingPlaceholderContact = @($rentalImports | Where-Object { $_.matched_client -eq $false }).Count
    sampleCars = @($carImports | Select-Object -First 5)
    sampleRentals = @($rentalImports | Select-Object -First 5)
}

if (-not $Apply) {
    $summary | ConvertTo-Json -Depth 8
    exit 0
}

$payload = [ordered]@{
    cars = @($carImports | ForEach-Object {
        [ordered]@{
            name = $_.name
            model_year = $_.model_year
            weekly_price = $_.weekly_price
            bond = $_.bond
            status = $_.status
            image = $_.image
        }
    })
    applications = @($applicationImports | ForEach-Object {
        [ordered]@{
            name = $_.name
            phone = $_.phone
            email = $_.email
            license_number = $_.license_number
            license_expiry = $_.license_expiry
            uber_status = $_.uber_status
            experience = $_.experience
            address = $_.address
            weekly_budget = $_.weekly_budget
            intended_start_date = $_.intended_start_date
            status = $_.status
        }
    })
    rentals = @($rentalImports | ForEach-Object {
        [ordered]@{
            registration = $_.registration
            application_email = $_.application_email
            start_date = $_.start_date
            weekly_price = $_.weekly_price
            status = $_.status
        }
    })
}

$tempId = [guid]::NewGuid().ToString('N')
$tempPayloadPath = Join-Path $repoRoot ".maple-import-$tempId.json"
$tempScriptPath = Join-Path $repoRoot ".maple-import-$tempId.mjs"

try {
    $payload | ConvertTo-Json -Depth 8 | Set-Content -Path $tempPayloadPath -Encoding UTF8

    $nodeScript = @'
import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const [, , payloadPath, envPath] = process.argv;

if (!payloadPath || !envPath) {
  throw new Error('Expected payload path and env path arguments.');
}

dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the provided .env file.');
}

const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8').replace(/^\uFEFF/, ''));
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function ensureEmpty(table) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) {
    throw new Error(`Refusing import because ${table} already contains data.`);
  }
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

    const query = supabase.from(table).insert(chunk);
    const { data, error } = await query.select(selectFields);
    if (error) throw error;
    inserted.push(...(data ?? []));
  }

  return inserted;
}

await ensureEmpty('bookings');
await ensureEmpty('lease_agreements');

await deleteAll('rentals');
await deleteAll('applications');
await deleteAll('cars');

const insertedCars = await insertInChunks('cars', payload.cars, 'id, name');
const insertedApplications = await insertInChunks('applications', payload.applications, 'id, email');

const carIdByRegistration = new Map(
  insertedCars.map((car) => {
    const match = /\(([A-Z0-9]+)\)$/.exec(car.name);
    return [match ? match[1] : car.name, car.id];
  }),
);

const applicationIdByEmail = new Map(insertedApplications.map((application) => [application.email, application.id]));

const rentalsToInsert = payload.rentals.map((rental) => {
  const carId = carIdByRegistration.get(rental.registration);
  const applicationId = applicationIdByEmail.get(rental.application_email);

  if (!carId) {
    throw new Error(`Missing imported car for registration ${rental.registration}`);
  }

  if (!applicationId) {
    throw new Error(`Missing imported application for email ${rental.application_email}`);
  }

  return {
    car_id: carId,
    application_id: applicationId,
    start_date: rental.start_date,
    weekly_price: rental.weekly_price,
    status: rental.status,
  };
});

await insertInChunks('rentals', rentalsToInsert, 'id');

const [{ count: carCount }, { count: applicationCount }, { count: rentalCount }] = await Promise.all([
  supabase.from('cars').select('id', { count: 'exact', head: true }),
  supabase.from('applications').select('id', { count: 'exact', head: true }),
  supabase.from('rentals').select('id', { count: 'exact', head: true }),
]);

console.log(JSON.stringify({
  importedCars: carCount ?? 0,
  importedApplications: applicationCount ?? 0,
  importedRentals: rentalCount ?? 0,
}, null, 2));
'@

    Set-Content -Path $tempScriptPath -Value $nodeScript -Encoding UTF8
    $nodeOutput = & node $tempScriptPath $tempPayloadPath $envPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw (($nodeOutput | Out-String).Trim())
    }
    $summary | Add-Member -NotePropertyName applyResult -NotePropertyValue (($nodeOutput | Out-String).Trim()) -Force
    $summary | ConvertTo-Json -Depth 8
}
finally {
    if (Test-Path $tempPayloadPath) {
        Remove-Item $tempPayloadPath -Force
    }

    if (Test-Path $tempScriptPath) {
        Remove-Item $tempScriptPath -Force
    }
}
