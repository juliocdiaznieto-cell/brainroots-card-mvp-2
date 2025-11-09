#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn get_public_key() -> String {
    include_str!("../public.pem").to_string()
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![get_public_key])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
