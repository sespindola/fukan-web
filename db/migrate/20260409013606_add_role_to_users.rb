class AddRoleToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :role, :text
  end
end
