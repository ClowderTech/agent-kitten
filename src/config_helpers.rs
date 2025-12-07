// src/config_helpers.rs
use bson::oid::ObjectId;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A flexible configuration type (mirrors the TS `Config` union).
///
/// - String -> Config::Str
/// - Number -> Config::Num (f64 to mirror JS number)
/// - Boolean -> Config::Bool
/// - Array -> Config::Array(Vec<Config>)
/// - Object -> Config::Object(HashMap<String, Config>)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Config {
    Str(String),
    Num(f64),
    Bool(bool),
    Array(Vec<Config>),
    Object(HashMap<String, Config>),
}

impl Config {
    /// Helper to create an empty object Config.
    pub fn empty_object() -> Self {
        Config::Object(HashMap::new())
    }
}

/// Equivalent of your TS `ServerConfig` and `UserConfig`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub _id: ObjectId,
    pub config: Config,
    pub serverid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserConfig {
    pub _id: ObjectId,
    pub config: Config,
    pub userid: String,
}

/// Sets a nested key like "a.b.2.c" on `obj`, creating intermediate objects/array elements where needed.
/// Returns Err(String) on invalid path (for example, trying to index into a non-array with a numeric index).
///
/// Behavior mirrors the TypeScript you provided:
/// - If encountering an array and an index is missing, we extend the array and insert empty objects at missing indices.
/// - If encountering an object key that doesn't exist or isn't an object, we replace/create it with an empty object.
pub fn set_nested_key(obj: &mut Config, path: &str, value: Config) -> Result<(), String> {
    let keys: Vec<&str> = path.split('.').collect();
    if keys.is_empty() {
        return Err("Empty path".into());
    }

    // Mutable pointer to current position
    let mut current: &mut Config = obj;

    for key in &keys[..keys.len() - 1] {
        match current {
            Config::Array(vec) => {
                // must be numeric index
                let idx = key.parse::<usize>().map_err(|_| {
                    format!("Array index expected but found a non-numeric key: {}", key)
                })?;

                // extend with empty objects as necessary
                while vec.len() <= idx {
                    vec.push(Config::empty_object());
                }

                // ensure the element is an object (TS creates {} if not object)
                if !matches!(vec[idx], Config::Object(_)) {
                    vec[idx] = Config::empty_object();
                }

                current = &mut vec[idx];
            }
            Config::Object(map) => {
                // If missing or not an object, set to empty object and continue
                if !map.contains_key(*key) || !matches!(map.get(*key), Some(Config::Object(_))) {
                    map.insert(key.to_string(), Config::empty_object());
                }
                current = map.get_mut(*key).unwrap();
            }
            _ => {
                return Err(format!(
                    "Invalid path: {}. Encountered non-object at key {}",
                    path, key
                ))
            }
        }
    }

    // Handle the last key
    let last_key = keys[keys.len() - 1];
    match current {
        Config::Array(vec) => {
            let idx = last_key.parse::<usize>().map_err(|_| {
                format!("Array index expected but found a non-numeric key: {}", last_key)
            })?;
            // extend and set
            while vec.len() <= idx {
                vec.push(Config::empty_object());
            }
            vec[idx] = value;
            Ok(())
        }
        Config::Object(map) => {
            map.insert(last_key.to_string(), value);
            Ok(())
        }
        _ => Err(format!(
            "Invalid path: {}. Encountered non-object at key {}",
            path, last_key
        )),
    }
}

/// Get a nested key like "a.b.2.c". Returns `Some(Config)` (cloned) if found, or `None` if any step is missing or the path is invalid.
pub fn get_nested_key(obj: &Config, path: &str) -> Option<Config> {
    let keys: Vec<&str> = path.split('.').collect();
    if keys.is_empty() {
        return None;
    }

    let mut current: &Config = obj;

    for k in keys {
        match current {
            Config::Array(vec) => {
                let idx = k.parse::<usize>().ok()?;
                current = vec.get(idx)?;
            }
            Config::Object(map) => {
                current = map.get(k)?;
            }
            _ => return None,
        }
    }

    Some(current.clone())
}
