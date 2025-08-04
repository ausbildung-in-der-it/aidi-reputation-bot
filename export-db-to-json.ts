#!/usr/bin/env npx tsx

import Database from "better-sqlite3";
import { writeFileSync } from "fs";
import { join } from "path";

interface ExportOptions {
  dbPath: string;
  outputPath?: string;
  pretty?: boolean;
}

function slugify(str: string): string {
  return str.replace(/[^a-zA-Z0-9-]/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '');
}

function exportSqliteToJson(options: ExportOptions) {
  const { dbPath, outputPath, pretty = true } = options;
  
  console.log(`Opening database: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true });
  
  try {
    // Get all table names
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    
    console.log(`Found ${tables.length} tables:`, tables.map(t => t.name).join(', '));
    
    const exportData: Record<string, any[]> = {};
    
    // Export each table
    for (const table of tables) {
      const tableName = table.name;
      console.log(`Exporting table: ${tableName}`);
      
      try {
        const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
        exportData[tableName] = rows;
        console.log(`  └─ ${rows.length} rows exported`);
      } catch (error) {
        console.error(`Error exporting table ${tableName}:`, error);
        exportData[tableName] = [];
      }
    }
    
    // Generate output filename if not provided
    let finalOutputPath = outputPath;
    if (!finalOutputPath) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dbBaseName = slugify(dbPath.split('/').pop()?.replace('.db', '') || 'database');
      finalOutputPath = join(process.cwd(), `${dbBaseName}_export_${timestamp}.json`);
    }
    
    // Write JSON file
    const jsonContent = pretty ? JSON.stringify(exportData, null, 2) : JSON.stringify(exportData);
    writeFileSync(finalOutputPath, jsonContent, 'utf8');
    
    console.log(`\n✅ Export completed successfully!`);
    console.log(`   File: ${finalOutputPath}`);
    console.log(`   Size: ${(jsonContent.length / 1024).toFixed(1)} KB`);
    console.log(`   Tables: ${Object.keys(exportData).length}`);
    console.log(`   Total records: ${Object.values(exportData).reduce((sum, arr) => sum + arr.length, 0)}`);
    
    // Show table summary
    console.log(`\n📊 Table Summary:`);
    for (const [tableName, rows] of Object.entries(exportData)) {
      console.log(`   ${tableName}: ${rows.length} records`);
    }
    
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
SQLite to JSON Exporter

Usage: npx tsx export-db-to-json.ts <database-path> [output-path] [options]

Arguments:
  database-path    Path to the SQLite database file
  output-path      Output JSON file path (optional, auto-generated if not provided)

Options:
  --compact        Export compact JSON (no pretty formatting)
  --help, -h       Show this help message

Examples:
  npx tsx export-db-to-json.ts ./data.db
  npx tsx export-db-to-json.ts ./data.db ./export.json
  npx tsx export-db-to-json.ts ./data.db --compact
  npx tsx export-db-to-json.ts backups/2025-01-15/backup.db ./analysis/data.json
`);
    process.exit(0);
  }
  
  const dbPath = args[0];
  let outputPath: string | undefined;
  let pretty = true;
  
  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--compact') {
      pretty = false;
    } else if (!arg.startsWith('--') && !outputPath) {
      outputPath = arg;
    }
  }
  
  if (!dbPath) {
    console.error('Error: Database path is required');
    process.exit(1);
  }
  
  exportSqliteToJson({
    dbPath,
    outputPath,
    pretty
  });
}

export { exportSqliteToJson };