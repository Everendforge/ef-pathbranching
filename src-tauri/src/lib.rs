use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFilePayload {
    path: String,
    content: String,
    modified_ms: Option<u128>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteResult {
    ok: bool,
    path: String,
    modified_ms: Option<u128>,
    message: Option<String>,
}

fn modified_ms(path: &Path) -> Option<u128> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
}

fn write_text_file(path: &Path, content: &str) -> WriteResult {
    let result = fs::File::create(path).and_then(|mut file| file.write_all(content.as_bytes()));
    WriteResult {
        ok: result.is_ok(),
        path: path.to_string_lossy().to_string(),
        modified_ms: modified_ms(path),
        message: result.err().map(|error| error.to_string()),
    }
}

#[tauri::command]
async fn open_project_dialog(app: tauri::AppHandle) -> Result<Option<ProjectFilePayload>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("PathBranching Project", &["pathbranching.json", "json"])
        .blocking_pick_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;

    Ok(Some(ProjectFilePayload {
        path: path.to_string_lossy().to_string(),
        content,
        modified_ms: modified_ms(&path),
    }))
}

#[tauri::command]
fn save_project_file(
    path: String,
    content: String,
    expected_modified_ms: Option<u128>,
) -> Result<WriteResult, String> {
    let path_ref = Path::new(&path);
    if let (Some(expected), Some(current)) = (expected_modified_ms, modified_ms(path_ref)) {
        if expected != current {
            return Ok(WriteResult {
                ok: false,
                path,
                modified_ms: Some(current),
                message: Some("Project file changed on disk. Use Save As or reopen before overwriting.".to_string()),
            });
        }
    }
    Ok(write_text_file(path_ref, &content))
}

#[tauri::command]
fn read_project_file(path: String) -> Result<ProjectFilePayload, String> {
    let path = Path::new(&path);
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(ProjectFilePayload {
        path: path.to_string_lossy().to_string(),
        content,
        modified_ms: modified_ms(path),
    })
}

#[tauri::command]
async fn save_project_as_dialog(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
) -> Result<Option<WriteResult>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("PathBranching Project", &["pathbranching.json", "json"])
        .set_file_name(default_name)
        .blocking_save_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    Ok(Some(write_text_file(&path, &content)))
}

#[tauri::command]
async fn export_runtime_dialog(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
) -> Result<Option<WriteResult>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Runtime Package", &["json"])
        .set_file_name(default_name)
        .blocking_save_file();

    let Some(file_path) = file_path else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|error| error.to_string())?;
    Ok(Some(write_text_file(&path, &content)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_project_dialog,
            read_project_file,
            save_project_file,
            save_project_as_dialog,
            export_runtime_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Everend PathBranching");
}
