// src/config_helpers.rs
// use bson::oid::ObjectId;
// use serde::{Deserialize, Serialize};
use serde_json::Value;

// /// Equivalent of your TS `ServerConfig` and `UserConfig`.
// #[derive(Debug, Clone, Serialize, Deserialize)]
// pub struct ServerConfig {
//     pub _id: ObjectId,
//     pub config: Value,
//     pub serverid: String,
// }

// #[derive(Debug, Clone, Serialize, Deserialize)]
// pub struct UserConfig {
//     pub _id: ObjectId,
//     pub config: Value,
//     pub userid: String,
// }

/// Sets a nested key like "a.b.2.c" on `obj`, creating intermediate objects/array elements where needed.
/// Returns Err(String) on invalid path (for example, trying to index into a non-array with a numeric index).
///
/// Behavior:
/// - If encountering an array and an index is missing, we extend the array and insert empty objects at missing indices.
/// - If encountering an object key that doesn't exist or isn't an object, we replace/create it with an empty object.
pub fn set_nested_key(obj: &mut Value, path: &str, value: Value) -> Result<(), String> {
    let keys: Vec<&str> = path.split('.').collect();
    if keys.is_empty() || path.is_empty() {
        return Err("Empty path".into());
    }

    let mut current: &mut Value = obj;

    for key in &keys[..keys.len() - 1] {
        match current {
            Value::Array(vec) => {
                let idx = key.parse::<usize>().map_err(|_| {
                    format!("Array index expected but found a non-numeric key: {}", key)
                })?;

                // Extend array with empty objects as necessary
                while vec.len() <= idx {
                    vec.push(Value::Object(serde_json::Map::new()));
                }

                // Ensure the element at index is an object
                if !vec[idx].is_object() {
                    vec[idx] = Value::Object(serde_json::Map::new());
                }

                current = &mut vec[idx];
            }
            Value::Object(map) => {
                // If missing or not an object, set to an empty object
                let entry = map
                    .entry((*key).to_string())
                    .or_insert_with(|| Value::Object(serde_json::Map::new()));

                if !entry.is_object() {
                    *entry = Value::Object(serde_json::Map::new());
                }

                current = entry;
            }
            _ => {
                return Err(format!(
                    "Invalid path: {}. Encountered non-object/non-array at key {}",
                    path, key
                ));
            }
        }
    }

    // Handle the final key
    let last_key = keys[keys.len() - 1];
    match current {
        Value::Array(vec) => {
            let idx = last_key.parse::<usize>().map_err(|_| {
                format!(
                    "Array index expected but found a non-numeric key: {}",
                    last_key
                )
            })?;

            while vec.len() <= idx {
                vec.push(Value::Object(serde_json::Map::new()));
            }

            vec[idx] = value;
            Ok(())
        }
        Value::Object(map) => {
            map.insert(last_key.to_string(), value);
            Ok(())
        }
        _ => Err(format!(
            "Invalid path: {}. Encountered non-object/non-array at key {}",
            path, last_key
        )),
    }
}

/// Get a nested key like "a.b.2.c". Returns `Some(Value)` (cloned) if found, or `None` if any step is missing or the path is invalid.
pub fn get_nested_key(obj: &Value, path: &str) -> Option<Value> {
    if path.is_empty() {
        return None;
    }

    let mut current: &Value = obj;

    for key in path.split('.') {
        match current {
            Value::Array(vec) => {
                let idx = key.parse::<usize>().ok()?;
                current = vec.get(idx)?;
            }
            Value::Object(map) => {
                current = map.get(key)?;
            }
            _ => return None,
        }
    }

    Some(current.clone())
}
