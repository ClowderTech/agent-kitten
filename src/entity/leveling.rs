use sea_orm::entity::prelude::*;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "leveling")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique_key = "pair")]
    pub user_id: u64,
    #[sea_orm(unique_key = "pair")]
    pub server_id: u64,
    pub level: i32,
    pub experience: i32,
}

impl ActiveModelBehavior for ActiveModel {}
