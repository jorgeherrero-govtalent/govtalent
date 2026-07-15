'use client';

import { useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const TYPE_LABELS = {
  empresa: 'Empresa',
  consultora_public_affairs: 'Consultora',
  tercer_sector_ong: 'ONG / Tercer sector',
  partido_politico: 'Partido político',
  institucion_publica: 'Institución pública',
  think_tank_fundacion: 'Think tank',
  medios_comunicacion: 'Medios',
  universidad_centro_educativo: 'Centro educativo',
  asociacion_profesional: 'Asociación profesional',
  otro: 'Otro',
};

const TARGET_FIELDS = [
  { key: 'name', label: 'Nombre de la organización', required: true },
  { key: 'sector', label: 'Sector / Industria' },
  { key: 'location', label: 'Ubicación / Ciudad' },
  { key: 'size_range', label: 'Nº de empleados' },
  { key: 'website_url', label: 'Sitio web' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'contact_email', label: 'Email de contacto' },
];

function mapSizeRange(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().toLowerCase();
  const exact = {
    '1-10': '1-10',
    '2-10': '1-10',
    'myself only': '1-10',
    '11-50': '11-50',
    '51-100': '50-200',
    '51-200': '50-200',
    '101-250': '50-200',
    '201-500': '200-1000',
    '251-500': '200-1000',
    '501-1000': '200-1000',
    '1001-5000': '+1000',
    '5001-10000': '+1000',
    '10001+': '+1000',
    '10000+': '+1000',
  };
  if (exact[cleaned]) return exact[cleaned];
  const nums = cleaned.match(/\d+/g);
  if (nums) {
    const n = parseInt(nums[0], 10);
    if (n <= 10) return '1-10';
    if (n <= 50) return '11-50';
    if (n <= 200) return '50-200';
    if (n <= 1000) return '200-1000';
    return '+1000';
  }
  return null;
}

export default function BulkImportPage() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [orgType, setOrgType] = useState('consultora_public_affairs');
  const [source, setSource] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState('');

  function processRows(columns, data) {
    if (!data.length) {
      setParseError('El archivo no tiene filas de datos.');
      return;
    }
    setCsvColumns(columns);
    setCsvRows(data);

    // Autodetección básica por nombre de columna habitual
    const auto = {};
    const guess = (patterns) => columns.find((c) => patterns.some((p) => c.toLowerCase().includes(p)));
    auto.name = guess(['company name', 'nombre', 'organization', 'name']) || '';
    auto.sector = guess(['industry', 'sector']) || '';
    auto.location = guess(['city', 'ciudad', 'location', 'ubicación']) || '';
    auto.size_range = guess(['range of employees', 'employees', 'tamaño', 'empleados']) || '';
    auto.website_url = guess(['website', 'web', 'sitio']) || '';
    auto.linkedin_url = guess(['linkedin']) || '';
    auto.contact_email = guess(['email']) || '';
    setMapping(auto);
    setStep(2);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setFileName(file.name);
    setSource(`${file.name}, importado ${new Date().toLocaleDateString('es-ES')}`);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const workbook = XLSX.read(evt.target.result, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
          if (!rows.length) {
            setParseError('La hoja de cálculo no tiene filas de datos.');
            return;
          }
          const columns = Object.keys(rows[0]);
          processRows(columns, rows);
        } catch (err) {
          setParseError('No se pudo leer el archivo Excel: ' + err.message);
        }
      };
      reader.onerror = () => setParseError('No se pudo leer el archivo.');
      reader.readAsArrayBuffer(file);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data.length) {
          setParseError('El archivo no tiene filas de datos.');
          return;
        }
        processRows(results.meta.fields || [], results.data);
      },
      error: (err) => setParseError(err.message),
    });
  }

  function buildMappedRows() {
    const val = (row, col) => (col && row[col] !== undefined && row[col] !== null ? String(row[col]) : '');
    return csvRows.map((row) => ({
      name: val(row, mapping.name),
      sector: val(row, mapping.sector),
      location: val(row, mapping.location),
      size_range: mapping.size_range ? mapSizeRange(val(row, mapping.size_range)) : null,
      website_url: val(row, mapping.website_url),
      linkedin_url: val(row, mapping.linkedin_url),
      contact_email: val(row, mapping.contact_email),
    }));
  }

  async function handleImport() {
    setSubmitting(true);
    const rows = buildMappedRows();
    const res = await fetch('/api/backoffice/organizations/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, org_type: orgType, source }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setParseError(data.error || 'No se pudo completar la importación');
      return;
    }
    setResult(data);
    setStep(4);
  }

  function reset() {
    setStep(1);
    setFileName('');
    setCsvColumns([]);
    setCsvRows([]);
    setMapping({});
    setResult(null);
    setParseError('');
  }

  const mappedPreview = step === 3 ? buildMappedRows().slice(0, 8) : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Cargar organizaciones</h1>
        <Link href="/backoffice/organizaciones" style={{ fontSize: 12.5, color: '#666' }}>
          ← Volver al listado
        </Link>
      </div>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        Sube un CSV con cualquier estructura de columnas — las mapeas tú en el siguiente paso. Sin límite de filas
        por lote razonable (hasta 5.000 de una vez; para más, divide el archivo).
      </p>

      {/* Indicador de pasos */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {['Subir archivo', 'Mapear columnas', 'Previsualizar', 'Resultado'].map((label, i) => (
          <div
            key={label}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 11.5,
              fontWeight: 600,
              textAlign: 'center',
              background: step === i + 1 ? '#1d6f5c' : step > i + 1 ? '#e8f4f0' : '#f4f4f0',
              color: step === i + 1 ? '#fff' : step > i + 1 ? '#1d6f5c' : '#999',
            }}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {parseError && (
        <div style={{ background: '#fdecea', border: '.5px solid #f3c9c9', color: '#c0392b', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
          <i className="ti ti-alert-triangle"></i> {parseError}
        </div>
      )}

      {/* PASO 1 */}
      {step === 1 && (
        <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <i className="ti ti-file-upload" style={{ fontSize: 32, color: '#1d6f5c', marginBottom: 12, display: 'block' }}></i>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            Selecciona un archivo CSV o Excel (.xlsx) — exportado de LinkedIn, TheirStack, o cualquier otra fuente
          </p>
          <label
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              borderRadius: 9,
              background: '#1d6f5c',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Elegir archivo
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* PASO 2 */}
      {step === 2 && (
        <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 24 }}>
          <p style={{ fontSize: 12.5, color: '#888', marginBottom: 16 }}>
            <i className="ti ti-file-text"></i> {fileName} — {csvRows.length} filas detectadas
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#555', marginBottom: 4 }}>
                Tipo de organización (aplica a todo el lote)
              </label>
              <select
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
                style={{ width: '100%', padding: '8px 11px', border: '.5px solid #e0dfd8', borderRadius: 8, fontSize: 13 }}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#555', marginBottom: 4 }}>
                Fuente (para trazabilidad y compliance)
              </label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                style={{ width: '100%', padding: '8px 11px', border: '.5px solid #e0dfd8', borderRadius: 8, fontSize: 13 }}
              />
            </div>
          </div>

          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 10 }}>Mapea cada columna de tu archivo:</p>

          {TARGET_FIELDS.map((f) => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 200, fontSize: 12.5, color: '#333' }}>
                {f.label} {f.required && <span style={{ color: '#c0392b' }}>*</span>}
              </div>
              <select
                value={mapping[f.key] || ''}
                onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                style={{ flex: 1, padding: '7px 10px', border: '.5px solid #e0dfd8', borderRadius: 8, fontSize: 12.5 }}
              >
                <option value="">— No mapear —</option>
                {csvColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <button onClick={reset} style={{ padding: '9px 16px', borderRadius: 8, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 13 }}>
              Empezar de nuevo
            </button>
            <button
              onClick={() => (mapping.name ? setStep(3) : setParseError('Tienes que mapear al menos el campo "Nombre".'))}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#1d6f5c', color: '#fff', fontSize: 13, fontWeight: 600 }}
            >
              Previsualizar →
            </button>
          </div>
        </div>
      )}

      {/* PASO 3 */}
      {step === 3 && (
        <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 24 }}>
          <p style={{ fontSize: 12.5, color: '#888', marginBottom: 16 }}>
            Previsualización de las primeras 8 filas de {csvRows.length} totales. Se importarán como{' '}
            <b>no verificadas</b> y <b>sin reclamar</b>, con tipo <b>{TYPE_LABELS[orgType]}</b>.
          </p>

          <div style={{ overflow: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: '#faf9f5', textAlign: 'left' }}>
                  {TARGET_FIELDS.map((f) => (
                    <th key={f.key} style={{ padding: '7px 10px', fontWeight: 700, color: '#666', whiteSpace: 'nowrap' }}>
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedPreview.map((row, i) => (
                  <tr key={i} style={{ borderTop: '.5px solid #e0dfd8' }}>
                    {TARGET_FIELDS.map((f) => (
                      <td key={f.key} style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: row[f.key] ? '#333' : '#ccc' }}>
                        {row[f.key] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(2)} style={{ padding: '9px 16px', borderRadius: 8, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 13 }}>
              ← Ajustar mapeo
            </button>
            <button
              onClick={handleImport}
              disabled={submitting}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#1d6f5c', color: '#fff', fontSize: 13, fontWeight: 600 }}
            >
              {submitting ? 'Importando...' : `Importar ${csvRows.length} organizaciones`}
            </button>
          </div>
        </div>
      )}

      {/* PASO 4 */}
      {step === 4 && result && (
        <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize: 32, color: '#1d9d63', marginBottom: 12, display: 'block' }}></i>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Importación completada</h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1d6f5c' }}>{result.inserted}</div>
              <div style={{ fontSize: 11.5, color: '#888' }}>Importadas</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#c9902e' }}>{result.skippedDuplicates}</div>
              <div style={{ fontSize: 11.5, color: '#888' }}>Duplicadas (omitidas)</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#c0392b' }}>{result.skippedNoName}</div>
              <div style={{ fontSize: 11.5, color: '#888' }}>Sin nombre (omitidas)</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={reset} style={{ padding: '9px 16px', borderRadius: 8, border: '.5px solid #e0dfd8', background: '#fff', fontSize: 13 }}>
              Cargar otro archivo
            </button>
            <Link
              href="/backoffice/organizaciones"
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#1d6f5c', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              Ver organizaciones
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
